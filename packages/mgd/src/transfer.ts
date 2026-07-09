import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { openAsBlob } from "node:fs";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { UsageError, MgdApiError } from "./errors.js";
import { note } from "./output.js";
import { MagdaClient } from "./client.js";
import {
    storageUpload,
    multipartInitiate,
    multipartPart,
    multipartComplete,
    multipartAbort
} from "./endpoints.js";
import { DATASETS_BUCKET_DEFAULT } from "./recordBuilders.js";

export function resolveDownloadUrl(
    downloadUrl: string,
    datasetsBucket: string = DATASETS_BUCKET_DEFAULT
): { kind: "storage"; path: string } | { kind: "external"; url: string } {
    if (downloadUrl.startsWith("magda://storage-api/")) {
        const rest = downloadUrl.slice("magda://storage-api/".length);
        const segments = rest
            .split("/")
            .map((s) => encodeURIComponent(decodeURIComponent(s)));
        return {
            kind: "storage",
            path: `/v0/storage/${datasetsBucket}/${segments.join("/")}`
        };
    }
    if (/^https?:\/\//.test(downloadUrl)) {
        return { kind: "external", url: downloadUrl };
    }
    throw new UsageError(`Unsupported download URL: ${downloadUrl}`);
}

export type RangeFetcher = (rangeStart?: number) => Promise<Response>;

export interface DownloadOptions {
    resume?: boolean;
    onProgress?: (done: number, total?: number) => void;
}

export async function downloadToFile(
    fetchRange: RangeFetcher,
    outputPath: string | "-",
    opts: DownloadOptions = {}
): Promise<{ bytes: number; resumedFrom: number }> {
    if (outputPath === "-") {
        const res = await fetchRange();
        let bytes = 0;
        if (res.body) {
            const counter = countBytes((n) => (bytes += n));
            await pipeline(
                Readable.fromWeb(res.body as any),
                counter,
                process.stdout
            );
        }
        return { bytes, resumedFrom: 0 };
    }

    const partPath = outputPath + ".part";
    let resumedFrom = 0;
    if (opts.resume) {
        try {
            resumedFrom = (await fsp.stat(partPath)).size;
        } catch {
            resumedFrom = 0;
        }
    }

    let res = await fetchRange(resumedFrom > 0 ? resumedFrom : undefined);
    if (resumedFrom > 0 && res.status !== 206) {
        note("Server does not support resume; restarting download.");
        resumedFrom = 0;
    }

    const total = contentTotal(res, resumedFrom);
    let bytes = resumedFrom;
    const out = fs.createWriteStream(partPath, {
        flags: resumedFrom > 0 ? "a" : "w"
    });
    if (res.body) {
        const counter = countBytes((n) => {
            bytes += n;
            opts.onProgress?.(bytes, total);
        });
        await pipeline(Readable.fromWeb(res.body as any), counter, out);
    } else {
        out.end();
    }
    await fsp.rename(partPath, outputPath);
    return { bytes, resumedFrom };
}

function contentTotal(res: Response, offset: number): number | undefined {
    const contentRange = res.headers.get("content-range");
    if (contentRange) {
        const m = /\/(\d+)$/.exec(contentRange);
        if (m) return Number(m[1]);
    }
    const len = res.headers.get("content-length");
    if (len) return offset + Number(len);
    return undefined;
}

function countBytes(onChunk: (n: number) => void): Transform {
    return new Transform({
        transform(chunk, _enc, cb) {
            onChunk((chunk as Buffer).length);
            cb(null, chunk);
        }
    });
}

export const SINGLE_SHOT_MAX = 16 * 1024 * 1024;

export interface PartPlan {
    partNumber: number;
    start: number;
    end: number;
}

export function planParts(fileSize: number, partSize: number): PartPlan[] {
    if (fileSize === 0) return [{ partNumber: 1, start: 0, end: 0 }];
    const parts: PartPlan[] = [];
    let start = 0;
    let partNumber = 1;
    while (start < fileSize) {
        const end = Math.min(start + partSize, fileSize);
        parts.push({ partNumber, start, end });
        start = end;
        partNumber++;
    }
    return parts;
}

export interface UploadOptions {
    localPath: string;
    bucket: string;
    key: string;
    recordId?: string;
    contentType?: string;
    partSize?: number;
    singleShot?: boolean;
    forceMultipart?: boolean;
    onProgress?: (done: number, total: number) => void;
}

export interface UploadResult {
    bucket: string;
    key: string;
    size: number;
    multipart: boolean;
}

export async function uploadFile(
    client: MagdaClient,
    opts: UploadOptions
): Promise<UploadResult> {
    const size = (await fsp.stat(opts.localPath)).size;
    const wantMultipart =
        opts.forceMultipart || (!opts.singleShot && size >= SINGLE_SHOT_MAX);

    if (!wantMultipart) {
        await singleShotUpload(client, opts, size);
        return { bucket: opts.bucket, key: opts.key, size, multipart: false };
    }

    let init: any;
    try {
        init = await client.json<any>(
            "POST",
            multipartInitiate(opts.bucket, opts.key),
            {
                query: { recordId: opts.recordId },
                headers: {
                    "content-type":
                        opts.contentType ?? "application/octet-stream"
                }
            }
        );
    } catch (e) {
        if (e instanceof MgdApiError && e.status === 404) {
            if (size >= SINGLE_SHOT_MAX) {
                note(
                    "Server lacks multipart upload support; attempting single-shot upload of a large file — this may exceed the server's body-size limit."
                );
            }
            await singleShotUpload(client, opts, size);
            return {
                bucket: opts.bucket,
                key: opts.key,
                size,
                multipart: false
            };
        }
        throw e;
    }

    const partSize: number =
        opts.partSize ?? init.recommendedPartSizeBytes ?? SINGLE_SHOT_MAX;
    const uploadId: string = init.uploadId;
    const etags: { partNumber: number; etag: string }[] = [];

    const handle = await fsp.open(opts.localPath, "r");
    try {
        for (const part of planParts(size, partSize)) {
            const length = part.end - part.start;
            const buffer = Buffer.alloc(length);
            if (length > 0) {
                await handle.read(buffer, 0, length, part.start);
            }
            const res = await client.json<any>(
                "PUT",
                multipartPart(opts.bucket, opts.key),
                {
                    query: { uploadId, partNumber: part.partNumber },
                    headers: { "content-type": "application/octet-stream" },
                    body: new Uint8Array(buffer)
                }
            );
            etags.push({ partNumber: res.partNumber, etag: res.etag });
            opts.onProgress?.(part.end, size);
        }
        await client.json("POST", multipartComplete(opts.bucket, opts.key), {
            query: { uploadId },
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ parts: etags })
        });
    } catch (e) {
        try {
            await client.request(
                "DELETE",
                multipartAbort(opts.bucket, opts.key),
                { query: { uploadId } }
            );
        } catch {
            // best-effort abort; the server's lifecycle rule cleans up eventually
        }
        throw e;
    } finally {
        await handle.close();
    }
    return { bucket: opts.bucket, key: opts.key, size, multipart: true };
}

async function singleShotUpload(
    client: MagdaClient,
    opts: UploadOptions,
    size: number
): Promise<void> {
    const fileName = path.basename(opts.key);
    const keyPrefix = path.dirname(opts.key);
    const blob = await openAsBlob(opts.localPath, {
        type: opts.contentType ?? "application/octet-stream"
    });
    const form = new FormData();
    form.append(fileName, blob, fileName);
    await client.request(
        "POST",
        storageUpload(opts.bucket, keyPrefix === "." ? "" : keyPrefix),
        {
            query: { recordId: opts.recordId },
            body: form
        }
    );
    opts.onProgress?.(size, size);
}

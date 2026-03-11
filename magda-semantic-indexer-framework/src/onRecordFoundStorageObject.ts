import { onRecordFoundType } from "magda-minion-framework/src/MinionOptions.js";
import { Chunker } from "./chunker.js";
import EmbeddingApiClient from "magda-typescript-common/src/EmbeddingApiClient.js";
import OpensearchApiClient from "magda-typescript-common/src/OpensearchApiClient.js";
import SemanticIndexerOptions from "./semanticIndexerOptions.js";
import { indexEmbeddingText } from "./indexEmbeddingText.js";
import { EmbeddingText } from "./createEmbeddingText.js";
import { Record } from "magda-typescript-common/src/generated/registry/api.js";
import retry from "magda-typescript-common/src/retry.js";
import fetch from "node-fetch";
import * as fs from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { v4 as uuidv4 } from "uuid";
import { SkipError } from "./SkipError.js";
import urijs from "urijs";
import { pipeline } from "stream/promises";
import { createBrotliDecompress, createGunzip, createInflate } from "zlib";
import Registry from "magda-typescript-common/src/registry/AuthorizedRegistryClient.js";
import ServerError from "magda-typescript-common/src/ServerError.js";
import { MinioClient } from "./MinioClient.js";
import { deleteTempFile } from "./helpers.js";

class RetryableDownloadError extends Error {}

// The onRecordFound function passed to minion sdk to handle storage object records
export const onRecordFoundStorageObject = (
    options: SemanticIndexerOptions,
    chunker: Chunker,
    embeddingApiClient: EmbeddingApiClient,
    opensearchApiClient: OpensearchApiClient,
    minioClient: MinioClient,
    registryReadonlyClient: Registry
): onRecordFoundType => {
    return async (dist: Record, registry) => {
        try {
            const datasetFormat = dist.aspects?.["dataset-format"]?.format;
            const dcatDist = dist.aspects?.["dcat-distribution-strings"] || {};
            const { format: dcatFormat, downloadURL, accessURL } = dcatDist;
            const fileDownloadURL = downloadURL || accessURL;
            let format = datasetFormat || dcatFormat;
            if (!format && fileDownloadURL) {
                format = new urijs(fileDownloadURL).suffix().toUpperCase();
            }

            // filler record
            if (
                !format ||
                !fileDownloadURL ||
                !options.formatTypes?.some((f) =>
                    format.toLowerCase().includes(f.toLowerCase())
                )
            ) {
                return;
            }

            let embeddingText: EmbeddingText;
            let filePath: string | null = null;

            const parentRecordId = await getParentRecordId(
                dist.id,
                registryReadonlyClient
            );
            try {
                try {
                    if (
                        options.autoDownloadFile === undefined ||
                        options.autoDownloadFile
                    ) {
                        filePath = await downloadFileWithRetry(
                            fileDownloadURL,
                            minioClient
                        );
                    }
                } catch (err) {
                    throw new SkipError(
                        `Error in downloading file: ${(err as Error).message}`
                    );
                }
                try {
                    embeddingText = await options.createEmbeddingText({
                        record: dist,
                        format: format,
                        filePath,
                        url: fileDownloadURL,
                        readonlyRegistry: registryReadonlyClient
                    });

                    if (!embeddingText.text && !embeddingText.subObjects) {
                        throw new SkipError(
                            "User-provided createEmbeddingText function returned no text or subObjects"
                        );
                    }
                } catch (err) {
                    throw new SkipError(
                        `Error in user-provided createEmbeddingText function: ${
                            (err as Error).message
                        }`
                    );
                }
            } finally {
                if (filePath) {
                    await deleteTempFile(filePath);
                }
            }

            await indexEmbeddingText({
                options,
                chunker,
                embeddingApiClient,
                opensearchApiClient,
                embeddingText,
                metadata: {
                    recordId: dist.id,
                    parentRecordId: parentRecordId,
                    aspectId: dist.aspects["dataset-format"]?.id,
                    fileFormat: format
                }
            });
        } catch (err) {
            if (err instanceof SkipError) {
                console.warn(
                    `Skipping distribution ${dist.id} because:`,
                    err.message
                );
                return;
            }
            throw err;
        }
    };
};

async function downloadFileWithRetry(
    url: string,
    minioClient: MinioClient
): Promise<string> {
    return retry(
        () => downloadFile(url, minioClient),
        1,
        5,
        (err, retries) => {},
        (err) => err instanceof RetryableDownloadError
    );
}

async function downloadFile(
    url: string,
    minioClient: MinioClient
): Promise<string> {
    const uri = urijs(url);
    if (uri.protocol() === "magda" && uri.hostname() === "storage-api") {
        try {
            return await minioClient.downloadFile(url);
        } catch (err) {
            throw new SkipError(
                `Failed to download file from Minio: ${(err as Error).message}`
            );
        }
    }

    let response;
    try {
        response = await fetch(url, {
            compress: false,
            headers: {
                "accept-encoding": "gzip, deflate, br"
            }
        });
    } catch (err) {
        throw new RetryableDownloadError(
            `Failed to download file because network error`
        );
    }

    if (!response.ok) {
        if (response.status >= 500 || response.status === 429) {
            throw new RetryableDownloadError(
                `Failed to download file because HTTP error ${response.status}`
            );
        }
        throw new SkipError(
            `Failed to download file because HTTP error ${response.status}`
        );
    }

    if (!response.body) {
        throw new SkipError("No response body to write to file");
    }

    const tempDir = tmpdir();
    const tempFileName = `${uuidv4()}`;
    const suffix = new urijs(url).suffix();
    const tempFilePath = join(tempDir, `${tempFileName}.${suffix}`);
    const responseStream = getDecodedResponseStream(response);

    try {
        const writeStream = fs.createWriteStream(tempFilePath);
        await pipeline(responseStream, writeStream);
        return tempFilePath;
    } catch (err) {
        await deleteTempFile(tempFilePath);
        throw new SkipError(`Failed to write file: ${(err as Error).message}`);
    }
}

function getDecodedResponseStream(response: {
    body: NodeJS.ReadableStream | null;
    headers: { get(name: string): string | null };
}): NodeJS.ReadableStream {
    if (!response.body) {
        throw new SkipError("No response body to write to file");
    }

    let stream: NodeJS.ReadableStream = response.body;
    const contentEncodingHeader =
        response.headers.get("content-encoding")?.toLowerCase() || "";
    const encodings = contentEncodingHeader
        .split(",")
        .map((encoding) => encoding.trim())
        .filter(Boolean);

    if (encodings.length === 0 || encodings[0] === "identity") {
        return stream;
    }

    // Content-Encoding is applied in order and must be decoded in reverse.
    for (let i = encodings.length - 1; i >= 0; i--) {
        const encoding = encodings[i];
        switch (encoding) {
            case "gzip":
            case "x-gzip":
                stream = stream.pipe(createGunzip());
                break;
            case "deflate":
                stream = stream.pipe(createInflate());
                break;
            case "br":
                stream = stream.pipe(createBrotliDecompress());
                break;
            default:
                throw new SkipError(
                    `Unsupported content encoding: ${encoding}`
                );
        }
    }

    return stream;
}

export async function getParentRecordId(
    distributionId: string,
    registry: Registry
): Promise<string | null> {
    try {
        const result = await registry.getRecords<Record>(
            ["dataset-distributions"],
            undefined,
            undefined,
            true,
            undefined,
            ["dataset-distributions.distributions:<|" + distributionId]
        );

        if (result instanceof ServerError) {
            console.error(`Failed to get parent record id: ${result.message}`);
            return null;
        }
        if (!("records" in result)) {
            console.error(`Failed to get parent record id`);
            return null;
        }

        return result.records[0]?.id || null;
    } catch (e) {
        console.error(`Unexpected error when getting parent record id`, e);
        return null;
    }
}

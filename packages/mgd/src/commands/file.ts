import path from "node:path";
import { Command } from "commander";
import { clientFromProfile } from "../client.js";
import { storageObject } from "../endpoints.js";
import { UsageError } from "../errors.js";
import { downloadToFile, uploadFile } from "../transfer.js";
import { note, printData } from "../output.js";
import { makeProgress } from "../progress.js";

export function parseBucketKey(arg: string): { bucket: string; key: string } {
    const idx = arg.indexOf("/");
    if (idx < 1 || idx === arg.length - 1) {
        throw new UsageError(
            `Expected <bucket>/<key...> (got: ${arg}). Example: magda-datasets/ds-1/dist-1/data.csv`
        );
    }
    return { bucket: arg.slice(0, idx), key: arg.slice(idx + 1) };
}

export function registerFileCommands(program: Command): void {
    const file = program.command("file").description("Storage objects");

    file.command("download <bucketAndKey>")
        .description("Download a storage object")
        .option("-o, --output <path>", "output file path, - for stdout")
        .option("--resume", "resume an interrupted download")
        .action(async (bucketAndKey: string, opts) => {
            const { bucket, key } = parseBucketKey(bucketAndKey);
            const client = await clientFromProfile();
            const output =
                opts.output ?? path.basename(decodeURIComponent(key));
            const progress = makeProgress(`download ${key}`);
            const result = await downloadToFile(
                (rangeStart) =>
                    client.request("GET", storageObject(bucket, key), {
                        headers:
                            rangeStart !== undefined
                                ? { Range: `bytes=${rangeStart}-` }
                                : undefined
                    }),
                output,
                { resume: Boolean(opts.resume), onProgress: progress.update }
            );
            progress.done();
            note(
                `Downloaded ${result.bytes} bytes to ${
                    output === "-" ? "stdout" : output
                }` +
                    (result.resumedFrom
                        ? ` (resumed from byte ${result.resumedFrom})`
                        : "")
            );
        });

    file.command("upload <localFile>")
        .description("Upload a file to storage (multipart for large files)")
        .requiredOption("--bucket <bucket>", "target bucket")
        .option("--key <key>", "object key (defaults to the file name)")
        .option("--record-id <id>", "record to associate for authorization")
        .option("--content-type <ct>", "content type")
        .option("--part-size <bytes>", "override multipart part size")
        .option("--single-shot", "force legacy single-request upload")
        .option("--json", "output JSON result")
        .action(async (localFile: string, opts) => {
            const client = await clientFromProfile();
            const key = opts.key ?? path.basename(localFile);
            const progress = makeProgress(`upload ${key}`);
            const result = await uploadFile(client, {
                localPath: localFile,
                bucket: opts.bucket,
                key,
                recordId: opts.recordId,
                contentType: opts.contentType,
                partSize: opts.partSize ? Number(opts.partSize) : undefined,
                singleShot: Boolean(opts.singleShot),
                onProgress: progress.update
            });
            progress.done();
            if (opts.json) {
                printData("json", result);
            } else {
                note(
                    `Uploaded ${result.size} bytes to ${result.bucket}/${result.key}` +
                        (result.multipart ? " (multipart)" : "")
                );
            }
        });
}

import path from "node:path";
import { Command } from "commander";
import { clientFromProfile } from "../client.js";
import {
    registryRecord,
    recordAspect,
    REGISTRY_RECORDS,
    storageObject
} from "../endpoints.js";
import { MgdApiError, UsageError } from "../errors.js";
import { printData, resolveMode, note } from "../output.js";
import { resolveDownloadUrl, downloadToFile, uploadFile } from "../transfer.js";
import { makeProgress } from "../progress.js";
import { mergeAspect, collect, withAspectHint, fetchOwner } from "./dataset.js";
import {
    parseAspectArg,
    appendVersion,
    storageDownloadUrl,
    getValidObjectKey,
    detectFormat,
    DATASETS_BUCKET_DEFAULT
} from "../recordBuilders.js";

export const DIST_OPTIONAL_ASPECTS = [
    "dcat-distribution-strings",
    "version",
    "publishing",
    "access-control",
    "source"
];

export function registerDistCommands(program: Command): void {
    const dist = program.command("dist").description("Distribution records");

    dist.command("get <distributionId>")
        .description("Fetch a distribution record")
        .option("--json", "output JSON")
        .action(async (distributionId: string, opts) => {
            const client = await clientFromProfile();
            const record = await client.json<any>(
                "GET",
                registryRecord(distributionId),
                {
                    query: DIST_OPTIONAL_ASPECTS.map((a): [string, string] => [
                        "optionalAspect",
                        a
                    ])
                }
            );
            const mode = resolveMode(opts);
            if (mode === "human") {
                const s = record.aspects?.["dcat-distribution-strings"] ?? {};
                process.stdout.write(`id:          ${record.id}\n`);
                process.stdout.write(
                    `title:       ${s.title ?? record.name}\n`
                );
                process.stdout.write(`format:      ${s.format ?? "n/a"}\n`);
                process.stdout.write(`byteSize:    ${s.byteSize ?? "n/a"}\n`);
                process.stdout.write(
                    `downloadURL: ${s.downloadURL ?? s.accessURL ?? "n/a"}\n`
                );
                process.stdout.write(`modified:    ${s.modified ?? "n/a"}\n`);
            } else {
                printData(mode, record);
            }
        });

    dist.command("update <distributionId>")
        .description(
            "Update distribution metadata (merges into dcat-distribution-strings)"
        )
        .option("--title <title>")
        .option("--desc <description>")
        .option("--format <format>")
        .option("--license <license>")
        .option(
            "--aspect <id=json...>",
            "replace an aspect entirely (repeatable)",
            collect,
            []
        )
        .action(async (distributionId: string, opts) => {
            const scalarPatch: Record<string, unknown> = {};
            if (opts.title) scalarPatch.title = opts.title;
            if (opts.desc) scalarPatch.description = opts.desc;
            if (opts.format) scalarPatch.format = opts.format;
            if (opts.license) scalarPatch.license = opts.license;
            if (
                Object.keys(scalarPatch).length === 0 &&
                (opts.aspect as string[]).length === 0
            ) {
                throw new UsageError(
                    "Nothing to update: pass --title/--desc/--format/--license or --aspect."
                );
            }
            const client = await clientFromProfile();
            if (Object.keys(scalarPatch).length > 0) {
                scalarPatch.modified = new Date().toISOString();
                await mergeAspect(
                    client,
                    distributionId,
                    "dcat-distribution-strings",
                    scalarPatch
                );
            }
            for (const arg of opts.aspect as string[]) {
                const { id, data } = await parseAspectArg(arg);
                try {
                    await client.json("PUT", recordAspect(distributionId, id), {
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify(data)
                    });
                } catch (e) {
                    throw withAspectHint(e);
                }
            }
            note(`Distribution ${distributionId} updated.`);
        });

    dist.command("replace-file <distributionId> <localFile>")
        .description(
            "Replace a distribution's data file (bumps the version aspect)"
        )
        .option(
            "--title <title>",
            "new distribution title (default: file name)"
        )
        .option("--bucket <bucket>", "storage bucket", DATASETS_BUCKET_DEFAULT)
        .option("--keep-old", "never delete the superseded storage object")
        .option("--json", "output JSON result")
        .action(async (distributionId: string, localFile: string, opts) => {
            const client = await clientFromProfile();
            const dist = await client.json<any>(
                "GET",
                registryRecord(distributionId),
                {
                    query: [
                        ["optionalAspect", "dcat-distribution-strings"],
                        ["optionalAspect", "version"]
                    ]
                }
            );
            const oldStrings =
                dist.aspects?.["dcat-distribution-strings"] ?? {};
            const oldVersionAspect = dist.aspects?.version;
            const oldDownloadURL: string | undefined = oldStrings.downloadURL;

            const parents = await client.json<any>("GET", REGISTRY_RECORDS, {
                query: [
                    ["aspect", "dataset-distributions"],
                    [
                        "aspectQuery",
                        `dataset-distributions.distributions:<|${distributionId}`
                    ],
                    ["limit", "1"]
                ]
            });
            const datasetId: string | undefined = parents?.records?.[0]?.id;
            if (!datasetId) {
                throw new MgdApiError(
                    `Could not find the parent dataset of ${distributionId}.`,
                    404,
                    "parent-dataset-not-found",
                    "If the distribution is unlinked, manage it via `mgd api request`."
                );
            }

            const owner = await fetchOwner(client);
            const now = new Date();
            const fileName = path.basename(localFile);
            const newKey = getValidObjectKey(
                datasetId,
                distributionId,
                fileName
            );
            const newDownloadURL = storageDownloadUrl(
                datasetId,
                distributionId,
                fileName
            );

            const progress = makeProgress(`upload ${fileName}`);
            const uploaded = await uploadFile(client, {
                localPath: localFile,
                bucket: opts.bucket,
                key: newKey,
                recordId: datasetId,
                onProgress: progress.update
            });
            progress.done();

            const title = opts.title ?? fileName;
            const newVersionAspect = appendVersion(oldVersionAspect, {
                title,
                creatorId: owner?.id,
                now,
                internalDataFileUrl: newDownloadURL,
                description: "Replaced superseded by a new distribution"
            });

            const detectedFormat = detectFormat(fileName);
            try {
                await mergeAspect(
                    client,
                    distributionId,
                    "dcat-distribution-strings",
                    {
                        title,
                        downloadURL: newDownloadURL,
                        byteSize: uploaded.size,
                        modified: now.toISOString(),
                        useStorageApi: true,
                        ...(detectedFormat ? { format: detectedFormat } : {})
                    }
                );
                try {
                    await client.json(
                        "PUT",
                        recordAspect(distributionId, "version"),
                        {
                            headers: { "content-type": "application/json" },
                            body: JSON.stringify(newVersionAspect)
                        }
                    );
                } catch (e) {
                    throw withAspectHint(e);
                }
            } catch (e) {
                try {
                    await client.request(
                        "DELETE",
                        storageObject(opts.bucket, newKey)
                    );
                } catch {
                    // best-effort cleanup
                }
                if (e instanceof MgdApiError) {
                    throw new MgdApiError(
                        `replace-file failed after upload: ${e.message}. ` +
                            `The new object was deleted (best effort); the distribution record is unchanged.`,
                        e.status,
                        e.code,
                        e.hint
                    );
                }
                throw e;
            }

            let oldFileDeleted = false;
            if (
                !opts.keepOld &&
                oldDownloadURL?.startsWith("magda://storage-api/") &&
                oldDownloadURL !== newDownloadURL &&
                !newVersionAspect.versions.some(
                    (v: any) => v.internalDataFileUrl === oldDownloadURL
                )
            ) {
                const resolved = resolveDownloadUrl(oldDownloadURL);
                if (resolved.kind === "storage") {
                    try {
                        await client.request("DELETE", resolved.path);
                        oldFileDeleted = true;
                    } catch {
                        note(
                            `Warning: could not delete superseded object ${oldDownloadURL}.`
                        );
                    }
                }
            }

            if (opts.json) {
                printData("json", {
                    distributionId,
                    datasetId,
                    downloadURL: newDownloadURL,
                    versionNumber: newVersionAspect.currentVersionNumber,
                    oldFileDeleted
                });
            } else {
                note(
                    `Replaced file of ${distributionId} (version ${newVersionAspect.currentVersionNumber}, ${uploaded.size} bytes).` +
                        (oldFileDeleted ? " Superseded object deleted." : "")
                );
            }
        });

    dist.command("download <distributionId>")
        .description("Download a distribution's data file")
        .option("-o, --output <path>", "output file path, - for stdout")
        .option("--resume", "resume an interrupted download")
        .action(async (distributionId: string, opts) => {
            const client = await clientFromProfile();
            const aspect = await client.json<any>(
                "GET",
                recordAspect(distributionId, "dcat-distribution-strings")
            );
            const url: string | undefined =
                aspect.downloadURL || aspect.accessURL;
            if (!url) {
                throw new MgdApiError(
                    `Distribution ${distributionId} has no downloadURL or accessURL.`,
                    404,
                    "no-download-url"
                );
            }
            const resolved = resolveDownloadUrl(url);
            const fetcher =
                resolved.kind === "storage"
                    ? (rangeStart?: number) =>
                          client.request("GET", resolved.path, {
                              headers:
                                  rangeStart !== undefined
                                      ? { Range: `bytes=${rangeStart}-` }
                                      : undefined
                          })
                    : async (rangeStart?: number) => {
                          const res = await fetch(resolved.url, {
                              headers:
                                  rangeStart !== undefined
                                      ? { Range: `bytes=${rangeStart}-` }
                                      : undefined
                          });
                          if (!res.ok && res.status !== 206) {
                              throw new MgdApiError(
                                  `Download failed: ${res.status} ${res.statusText}`,
                                  res.status,
                                  "download-failed"
                              );
                          }
                          return res;
                      };
            const defaultName = decodeURIComponent(
                (resolved.kind === "storage"
                    ? resolved.path
                    : new URL(resolved.url).pathname
                )
                    .split("/")
                    .filter(Boolean)
                    .pop() || "download"
            );
            const output = opts.output ?? defaultName;
            const progress = makeProgress(`download ${defaultName}`);
            const result = await downloadToFile(fetcher, output, {
                resume: Boolean(opts.resume),
                onProgress: progress.update
            });
            progress.done();
            note(
                `Downloaded ${result.bytes} bytes to ${
                    output === "-" ? "stdout" : output
                }`
            );
        });
}

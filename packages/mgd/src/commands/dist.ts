import path from "node:path";
import { Command } from "commander";
import { clientFromProfile, eventIdFrom } from "../client.js";
import {
    registryRecord,
    registryRecordInFull,
    recordAspect,
    REGISTRY_RECORDS,
    storageObject
} from "../endpoints.js";
import { MgdApiError, UsageError } from "../errors.js";
import { printData, resolveMode, note } from "../output.js";
import { resolveDownloadUrl, downloadToFile, uploadFile } from "../transfer.js";
import { makeProgress } from "../progress.js";
import { mergeAspect, collect, withAspectHint, fetchOwner } from "./dataset.js";
import { publishDistribution, renderPublishResult } from "../publishing.js";
import {
    parseAspectArg,
    storageDownloadUrl,
    getValidObjectKey,
    detectFormat,
    DATASETS_BUCKET_DEFAULT
} from "../recordBuilders.js";
import {
    reconcileVersion,
    bumpRecordVersion,
    writeVersionAspect,
    VersionAspectData
} from "../versionAspect.js";

export function registerDistCommands(program: Command): void {
    const dist = program.command("dist").description("Distribution records");

    // publish/unpublish deliberately do NOT bump the version aspect: a
    // publishing-state flip is lifecycle metadata, not a content change. See
    // issue #3687.
    for (const verb of ["publish", "unpublish"] as const) {
        const state = verb === "publish" ? "published" : "draft";
        dist.command(`${verb} <distributionId>`)
            .description(`Set a distribution's publishing state to ${state}`)
            .option("--json", "output the result as JSON")
            .action(async (distributionId: string, opts) => {
                const client = await clientFromProfile();
                const records = await publishDistribution(
                    client,
                    distributionId,
                    state
                );
                renderPublishResult(records, resolveMode(opts));
            });
    }

    dist.command("get <distributionId>")
        .description("Fetch a distribution record")
        .option("--json", "output JSON")
        .action(async (distributionId: string, opts) => {
            const client = await clientFromProfile();
            const record = await client.json<any>(
                "GET",
                registryRecordInFull(distributionId)
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
        .option("--json", "output the result as JSON")
        .action(async (distributionId: string, opts) => {
            const scalarPatch: Record<string, unknown> = {};
            if (opts.title) scalarPatch.title = opts.title;
            if (opts.desc) scalarPatch.description = opts.desc;
            if (opts.format) scalarPatch.format = opts.format;
            if (opts.license) scalarPatch.license = opts.license;
            const aspectArgs: { id: string; data: unknown }[] = [];
            for (const arg of opts.aspect as string[]) {
                aspectArgs.push(await parseAspectArg(arg));
            }
            if (
                Object.keys(scalarPatch).length === 0 &&
                aspectArgs.length === 0
            ) {
                throw new UsageError(
                    "Nothing to update: pass --title/--desc/--format/--license or --aspect."
                );
            }
            const client = await clientFromProfile();
            let lastEventId = 0;
            let mergedTitle: string | undefined;
            if (Object.keys(scalarPatch).length > 0) {
                scalarPatch.modified = new Date().toISOString();
                const { eventId, merged } = await mergeAspect(
                    client,
                    distributionId,
                    "dcat-distribution-strings",
                    scalarPatch
                );
                lastEventId = Math.max(lastEventId, eventId);
                mergedTitle =
                    typeof merged.title === "string" ? merged.title : undefined;
            }
            for (const { id, data } of aspectArgs) {
                try {
                    const res = await client.request(
                        "PUT",
                        recordAspect(distributionId, id),
                        {
                            headers: { "content-type": "application/json" },
                            body: JSON.stringify(data)
                        }
                    );
                    lastEventId = Math.max(lastEventId, eventIdFrom(res));
                } catch (e) {
                    throw withAspectHint(e);
                }
            }
            let version: VersionAspectData | undefined;
            // Divergence from the web client (deliberate, record-scoped model):
            // a distribution-metadata edit bumps the DISTRIBUTION's version;
            // the web client bumps nothing on such an edit (its session model
            // folds it into the dataset-level bump). See issue #3687.
            // An explicit user write to `version` always wins: skip auto-bump.
            if (!aspectArgs.some((a) => a.id === "version")) {
                version = await bumpRecordVersion(client, distributionId, {
                    eventId: lastEventId,
                    now: new Date(),
                    title: (opts.title as string | undefined) ?? mergedTitle,
                    creatorId: (await fetchOwner(client))?.id,
                    description: "Distribution metadata updated"
                });
            }
            if (opts.json)
                printData("json", {
                    distributionId,
                    ok: true,
                    ...(version
                        ? { versionNumber: version.currentVersionNumber }
                        : {})
                });
            else note(`Distribution ${distributionId} updated.`);
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
            const detectedFormat = detectFormat(fileName);
            let contentEventId = 0;
            try {
                const { eventId } = await mergeAspect(
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
                contentEventId = eventId;
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

            // The content change is in; version maintenance is best-effort
            // from here (a failure warns and the reconcile self-heals later).
            //
            // Divergence from the web client (deliberate): a file replacement
            // bumps ONLY the distribution's version, not the parent dataset's
            // (a web-client session would bump both). `forceBump` appends a new
            // version even when the current one is untagged, so the new file's
            // internalDataFileUrl is never lost from history. See issue #3687.
            const newVersionAspect = reconcileVersion(oldVersionAspect, {
                eventId: contentEventId,
                title,
                creatorId: owner?.id,
                now,
                internalDataFileUrl: newDownloadURL,
                description: "Replaced superseded by a new distribution",
                forceBump: true
            }).data;
            await writeVersionAspect(client, distributionId, newVersionAspect);

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

    dist.command("remove <distributionId>")
        .description(
            "Remove a distribution from its dataset and delete it " +
                "(bumps the dataset's version aspect)"
        )
        .option(
            "--keep-files",
            "do not delete the distribution's stored data files"
        )
        .option(
            "--bucket <bucket>",
            "storage bucket the data files live in",
            DATASETS_BUCKET_DEFAULT
        )
        .option("--json", "output JSON result")
        .action(async (distributionId: string, opts) => {
            const client = await clientFromProfile();

            // 1. find the parent dataset (with its distribution list, title)
            const parents = await client.json<any>("GET", REGISTRY_RECORDS, {
                query: [
                    ["aspect", "dataset-distributions"],
                    ["optionalAspect", "dcat-dataset-strings"],
                    [
                        "aspectQuery",
                        `dataset-distributions.distributions:<|${distributionId}`
                    ],
                    ["limit", "1"]
                ]
            });
            const parent = parents?.records?.[0];
            if (!parent?.id) {
                throw new MgdApiError(
                    `Could not find the parent dataset of ${distributionId}.`,
                    404,
                    "parent-dataset-not-found",
                    "If the distribution is unlinked, delete it directly: " +
                        `mgd api request DELETE /v0/registry/records/${distributionId}`
                );
            }
            const datasetId: string = parent.id;

            // 2. fetch the distribution's stored-file URLs before deletion
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
            const owner = await fetchOwner(client);
            const now = new Date();

            // 3. unlink from the dataset first so it never references a
            //    deleted record
            const current: string[] = (
                parent.aspects?.["dataset-distributions"]?.distributions ?? []
            ).map((d: any) => (typeof d === "string" ? d : d.id));
            const { eventId: e1 } = await mergeAspect(
                client,
                datasetId,
                "dataset-distributions",
                { distributions: current.filter((id) => id !== distributionId) }
            );
            const { eventId: e2 } = await mergeAspect(
                client,
                datasetId,
                "dcat-dataset-strings",
                { modified: now.toISOString() }
            );

            // 4. removing a distribution is a new dataset version
            const dsVersion = await bumpRecordVersion(client, datasetId, {
                eventId: Math.max(e1, e2),
                now,
                title:
                    parent.aspects?.["dcat-dataset-strings"]?.title ??
                    parent.name,
                creatorId: owner?.id,
                description: "Distribution removed"
            });

            // 5. delete the distribution record
            await client.request("DELETE", registryRecord(distributionId));

            // 6. best-effort storage cleanup (current file + all versions)
            const urls = new Set<string>();
            const dl: unknown =
                dist.aspects?.["dcat-distribution-strings"]?.downloadURL;
            if (typeof dl === "string") urls.add(dl);
            for (const v of dist.aspects?.version?.versions ?? []) {
                if (typeof v?.internalDataFileUrl === "string")
                    urls.add(v.internalDataFileUrl);
            }
            const filesDeleted: string[] = [];
            if (!opts.keepFiles) {
                for (const url of urls) {
                    if (!url.startsWith("magda://storage-api/")) continue;
                    const resolved = resolveDownloadUrl(url, opts.bucket);
                    if (resolved.kind !== "storage") continue;
                    try {
                        await client.request("DELETE", resolved.path);
                        filesDeleted.push(url);
                    } catch {
                        note(`Warning: could not delete stored object ${url}.`);
                    }
                }
            }

            if (opts.json) {
                printData("json", {
                    distributionId,
                    datasetId,
                    ...(dsVersion
                        ? {
                              datasetVersionNumber:
                                  dsVersion.currentVersionNumber
                          }
                        : {}),
                    filesDeleted
                });
            } else {
                note(
                    `Removed distribution ${distributionId} from dataset ${datasetId}` +
                        (dsVersion
                            ? ` (dataset version ${dsVersion.currentVersionNumber})`
                            : "") +
                        (filesDeleted.length
                            ? `; deleted ${filesDeleted.length} stored file(s).`
                            : ".")
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

import path from "node:path";
import { Command } from "commander";
import { clientFromProfile, MagdaClient } from "../client.js";
import {
    registryRecord,
    registryRecordInFull,
    recordAspect,
    WHOAMI,
    REGISTRY_RECORDS,
    storageObject
} from "../endpoints.js";
import { MgdApiError, UsageError } from "../errors.js";
import { printData, resolveMode, note } from "../output.js";
import { makeProgress } from "../progress.js";
import {
    buildDatasetRecord,
    buildDistributionRecord,
    deriveSiteUrl,
    createId,
    parseAspectArg,
    parseAspectValue,
    storageDownloadUrl,
    getValidObjectKey,
    detectFormat,
    DATASETS_BUCKET_DEFAULT
} from "../recordBuilders.js";
import { uploadFile } from "../transfer.js";

export async function fetchOwner(
    client: MagdaClient
): Promise<{ id?: string; orgUnitId?: string } | undefined> {
    try {
        const user = await client.json<any>("GET", WHOAMI);
        return user?.id
            ? { id: user.id, orgUnitId: user.orgUnitId }
            : undefined;
    } catch {
        return undefined;
    }
}

export function withAspectHint(e: unknown): unknown {
    if (
        e instanceof MgdApiError &&
        e.status === 400 &&
        /aspect/i.test(e.message)
    ) {
        return new MgdApiError(
            e.message,
            e.status,
            e.code,
            "If the record uses a custom aspect, create its definition first: mgd aspect create <id> --name <name> --schema @schema.json"
        );
    }
    return e;
}

export function collect(value: string, previous: string[]): string[] {
    return [...previous, value];
}

export async function mergeAspect(
    client: MagdaClient,
    recordId: string,
    aspectId: string,
    patch: Record<string, unknown>
): Promise<void> {
    let current: Record<string, unknown> = {};
    try {
        current = await client.json("GET", recordAspect(recordId, aspectId));
    } catch (e) {
        if (!(e instanceof MgdApiError && e.status === 404)) throw e;
    }
    await client.json("PUT", recordAspect(recordId, aspectId), {
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...current, ...patch })
    });
}

export function registerDatasetCommands(program: Command): void {
    const dataset = program.command("dataset").description("Dataset records");

    dataset
        .command("get <datasetId>")
        .description("Fetch a dataset record")
        .option("--aspect <name>", "fetch a single aspect only")
        .option("--json", "output JSON")
        .action(async (datasetId: string, opts) => {
            const client = await clientFromProfile();
            if (opts.aspect) {
                const aspect = await client.json<any>(
                    "GET",
                    recordAspect(datasetId, opts.aspect)
                );
                printData("json", aspect);
                return;
            }
            const record = await client.json<any>(
                "GET",
                registryRecordInFull(datasetId)
            );
            const mode = resolveMode(opts);
            if (mode === "human") {
                const dcat = record.aspects?.["dcat-dataset-strings"] ?? {};
                const distributions =
                    record.aspects?.["dataset-distributions"]?.distributions ??
                    [];
                process.stdout.write(`id:            ${record.id}\n`);
                process.stdout.write(
                    `title:         ${dcat.title ?? record.name}\n`
                );
                process.stdout.write(
                    `publishing:    ${
                        record.aspects?.publishing?.state ?? "n/a"
                    }\n`
                );
                process.stdout.write(
                    `modified:      ${dcat.modified ?? "n/a"}\n`
                );
                process.stdout.write(
                    `distributions: ${distributions.length}\n`
                );
                if (dcat.description) {
                    process.stdout.write(
                        `description:   ${dcat.description}\n`
                    );
                }
            } else {
                printData(mode, record);
            }
        });

    dataset
        .command("distributions <datasetId>")
        .description("List a dataset's distributions")
        .option("--json", "output JSON")
        .option("--jsonl", "one distribution per line")
        .action(async (datasetId: string, opts) => {
            const client = await clientFromProfile();
            const record = await client.json<any>(
                "GET",
                registryRecord(datasetId),
                {
                    query: [
                        ["aspect", "dataset-distributions"],
                        ["dereference", "true"]
                    ] as [string, string][]
                }
            );
            const dists: any[] =
                record.aspects?.["dataset-distributions"]?.distributions ?? [];
            const mode = resolveMode(opts);
            if (mode === "human") {
                for (const d of dists) {
                    const s = d.aspects?.["dcat-distribution-strings"] ?? {};
                    process.stdout.write(
                        `${d.id}\t${s.title ?? d.name}\t${s.format ?? ""}\t${
                            s.downloadURL ?? s.accessURL ?? ""
                        }\n`
                    );
                }
                note(`${dists.length} distributions`);
            } else {
                printData(mode, dists);
            }
        });

    dataset
        .command("create")
        .description("Create a new dataset record (draft by default)")
        .requiredOption("--title <title>", "dataset title")
        .option("--desc <description>", "dataset description")
        .option("--publish", "create as published instead of draft")
        .option(
            "--aspect <id=json...>",
            "attach custom aspect data (repeatable; value may be inline JSON, @file, or -)",
            collect,
            []
        )
        .option("--json", "output the created record as JSON")
        .action(async (opts) => {
            const client = await clientFromProfile();
            const owner = await fetchOwner(client);
            const extraAspects: Record<string, unknown> = {};
            for (const arg of opts.aspect as string[]) {
                const { id, data } = await parseAspectArg(arg);
                extraAspects[id] = data;
            }
            const record = buildDatasetRecord({
                id: createId("ds"),
                title: opts.title,
                description: opts.desc,
                publish: Boolean(opts.publish),
                owner,
                now: new Date(),
                sourceUrl: deriveSiteUrl(client.opts.baseUrl),
                extraAspects
            });
            try {
                await client.json("POST", REGISTRY_RECORDS, {
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify(record)
                });
            } catch (e) {
                throw withAspectHint(e);
            }
            if (opts.json) printData("json", record);
            else process.stdout.write(record.id + "\n");
        });

    dataset
        .command("update <datasetId>")
        .description(
            "Update dataset metadata (merges into dcat-dataset-strings; record name is unchanged)"
        )
        .option("--title <title>")
        .option("--desc <description>")
        .option("--license <license>")
        .option(
            "--aspect <id=json...>",
            "replace an aspect entirely (repeatable)",
            collect,
            []
        )
        .option("--json", "output the result as JSON")
        .action(async (datasetId: string, opts) => {
            const scalarPatch: Record<string, unknown> = {};
            if (opts.title) scalarPatch.title = opts.title;
            if (opts.desc) scalarPatch.description = opts.desc;
            if (opts.license) scalarPatch.defaultLicense = opts.license;
            if (
                Object.keys(scalarPatch).length === 0 &&
                (opts.aspect as string[]).length === 0
            ) {
                throw new UsageError(
                    "Nothing to update: pass --title/--desc/--license or --aspect."
                );
            }
            const client = await clientFromProfile();
            if (Object.keys(scalarPatch).length > 0) {
                scalarPatch.modified = new Date().toISOString();
                await mergeAspect(
                    client,
                    datasetId,
                    "dcat-dataset-strings",
                    scalarPatch
                );
            }
            for (const arg of opts.aspect as string[]) {
                const { id, data } = await parseAspectArg(arg);
                try {
                    await client.json("PUT", recordAspect(datasetId, id), {
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify(data)
                    });
                } catch (e) {
                    throw withAspectHint(e);
                }
            }
            if (opts.json) printData("json", { datasetId, ok: true });
            else note(`Dataset ${datasetId} updated.`);
        });

    const datasetAspect = dataset
        .command("aspect")
        .description(
            "Read or write a record's aspect data (works for any record)"
        );

    datasetAspect
        .command("get <recordId> <aspectId>")
        .option("--json", "output JSON (default)")
        .action(async (recordId: string, aspectId: string) => {
            const client = await clientFromProfile();
            const data = await client.json(
                "GET",
                recordAspect(recordId, aspectId)
            );
            printData("json", data);
        });

    datasetAspect
        .command("set <recordId> <aspectId> <value>")
        .description("value: inline JSON, @file.json, or - for stdin")
        .option("--json", "output the result as JSON")
        .action(
            async (
                recordId: string,
                aspectId: string,
                value: string,
                opts
            ) => {
                const client = await clientFromProfile();
                const data = await parseAspectValue(value);
                try {
                    await client.json("PUT", recordAspect(recordId, aspectId), {
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify(data)
                    });
                } catch (e) {
                    throw withAspectHint(e);
                }
                if (opts.json)
                    printData("json", { recordId, aspectId, ok: true });
                else note(`Aspect "${aspectId}" set on ${recordId}.`);
            }
        );

    datasetAspect
        .command("patch <recordId> <aspectId> <value>")
        .description(
            "Merge a partial aspect object into the existing aspect " +
                "(value: inline JSON, @file.json, or - for stdin). Only the " +
                "supplied fields change; use `set` to replace the whole aspect."
        )
        .option("--json", "output the result as JSON")
        .action(
            async (
                recordId: string,
                aspectId: string,
                value: string,
                opts
            ) => {
                const client = await clientFromProfile();
                const data = await parseAspectValue(value);
                try {
                    // ?merge=true asks the registry to deep-merge the partial
                    // body into the existing aspect server-side (JsonUtils.merge),
                    // so we never read-then-replace and can't drop fields.
                    await client.json("PUT", recordAspect(recordId, aspectId), {
                        query: { merge: true },
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify(data)
                    });
                } catch (e) {
                    throw withAspectHint(e);
                }
                if (opts.json)
                    printData("json", { recordId, aspectId, ok: true });
                else note(`Aspect "${aspectId}" patched on ${recordId}.`);
            }
        );

    datasetAspect
        .command("delete <recordId> <aspectId>")
        .option("--json", "output the result as JSON")
        .action(async (recordId: string, aspectId: string, opts) => {
            const client = await clientFromProfile();
            await client.json("DELETE", recordAspect(recordId, aspectId));
            if (opts.json) printData("json", { recordId, aspectId, ok: true });
            else note(`Aspect "${aspectId}" deleted from ${recordId}.`);
        });

    dataset
        .command("add-file <datasetId> [localFile]")
        .description(
            "Upload a file and attach it to a dataset as a new distribution " +
                "(or register a link-only distribution with --access-url)"
        )
        .option("--access-url <url>", "register a link instead of uploading")
        .option("--title <title>", "distribution title (default: file name)")
        .option("--desc <description>", "distribution description")
        .option(
            "--format <format>",
            "data format (default: from file extension)"
        )
        .option("--bucket <bucket>", "storage bucket", DATASETS_BUCKET_DEFAULT)
        .option(
            "--aspect <id=json...>",
            "attach custom aspect data to the distribution (repeatable)",
            collect,
            []
        )
        .option("--json", "output JSON result")
        .action(
            async (datasetId: string, localFile: string | undefined, opts) => {
                if (Boolean(localFile) === Boolean(opts.accessUrl)) {
                    throw new UsageError(
                        "Provide exactly one of <localFile> or --access-url."
                    );
                }
                const client = await clientFromProfile();
                const dataset = await client.json<any>(
                    "GET",
                    registryRecord(datasetId),
                    {
                        query: [
                            ["optionalAspect", "publishing"],
                            ["optionalAspect", "dataset-distributions"]
                        ]
                    }
                );
                const publishingState: string =
                    dataset.aspects?.publishing?.state ?? "draft";
                const owner = await fetchOwner(client);
                const distId = createId("dist");
                const now = new Date();

                const extraAspects: Record<string, unknown> = {};
                for (const arg of opts.aspect as string[]) {
                    const { id, data } = await parseAspectArg(arg);
                    extraAspects[id] = data;
                }

                let downloadURL: string | undefined;
                let byteSize: number | undefined;
                let uploadedKey: string | undefined;
                let fileName: string | undefined;

                if (localFile) {
                    fileName = path.basename(localFile);
                    uploadedKey = getValidObjectKey(
                        datasetId,
                        distId,
                        fileName
                    );
                    const progress = makeProgress(`upload ${fileName}`);
                    const uploaded = await uploadFile(client, {
                        localPath: localFile,
                        bucket: opts.bucket,
                        key: uploadedKey,
                        recordId: datasetId,
                        onProgress: progress.update
                    });
                    progress.done();
                    byteSize = uploaded.size;
                    downloadURL = storageDownloadUrl(
                        datasetId,
                        distId,
                        fileName
                    );
                }

                const title: string =
                    opts.title ?? fileName ?? opts.accessUrl ?? distId;
                const record = buildDistributionRecord({
                    id: distId,
                    title,
                    description: opts.desc,
                    downloadURL,
                    accessURL: opts.accessUrl,
                    format:
                        opts.format ??
                        (fileName ? detectFormat(fileName) : undefined),
                    byteSize,
                    owner,
                    publishingState,
                    now,
                    internalDataFileUrl: downloadURL,
                    sourceUrl: deriveSiteUrl(client.opts.baseUrl),
                    extraAspects
                });

                let recordCreated = false;
                try {
                    await client.json("POST", REGISTRY_RECORDS, {
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify(record)
                    });
                    recordCreated = true;
                    const current: string[] = (
                        dataset.aspects?.["dataset-distributions"]
                            ?.distributions ?? []
                    ).map((d: any) => (typeof d === "string" ? d : d.id));
                    await mergeAspect(
                        client,
                        datasetId,
                        "dataset-distributions",
                        {
                            distributions: [...current, distId]
                        }
                    );
                    await mergeAspect(
                        client,
                        datasetId,
                        "dcat-dataset-strings",
                        {
                            modified: now.toISOString()
                        }
                    );
                } catch (e) {
                    if (recordCreated) {
                        try {
                            await client.request(
                                "DELETE",
                                registryRecord(distId)
                            );
                        } catch {
                            // best-effort cleanup
                        }
                    }
                    if (uploadedKey) {
                        try {
                            await client.request(
                                "DELETE",
                                storageObject(opts.bucket, uploadedKey)
                            );
                        } catch {
                            // best-effort cleanup
                        }
                    }
                    const wrapped = withAspectHint(e);
                    if (wrapped instanceof MgdApiError && uploadedKey) {
                        const cleanupMsg = recordCreated
                            ? `The uploaded object and the orphan distribution record were deleted (best effort).`
                            : `The uploaded object was deleted (best effort). No distribution record was created.`;
                        const recoveryHint =
                            `If cleanup failed, remove leftovers with: ` +
                            `mgd api request DELETE /v0/storage/${opts.bucket}/${uploadedKey} ` +
                            (recordCreated
                                ? `and: mgd api request DELETE /v0/registry/records/${distId}`
                                : ``);
                        throw new MgdApiError(
                            `add-file failed after upload: ${wrapped.message}. ` +
                                cleanupMsg,
                            wrapped.status,
                            wrapped.code,
                            recoveryHint
                        );
                    }
                    throw wrapped;
                }

                if (opts.json) {
                    printData("json", {
                        datasetId,
                        distributionId: distId,
                        ...(downloadURL
                            ? { downloadURL, bytes: byteSize }
                            : {}),
                        ...(opts.accessUrl ? { accessURL: opts.accessUrl } : {})
                    });
                } else {
                    process.stdout.write(distId + "\n");
                    note(
                        `Attached ${
                            localFile
                                ? `file "${fileName}"`
                                : `link ${opts.accessUrl}`
                        } to dataset ${datasetId} as distribution ${distId}.`
                    );
                }
            }
        );
}

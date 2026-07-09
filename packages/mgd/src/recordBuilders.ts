import fs from "node:fs/promises";
import { randomUUID, createHash } from "node:crypto";
import { UsageError } from "./errors.js";

export const DATASETS_BUCKET_DEFAULT = "magda-datasets";

export function createId(type: "ds" | "dist"): string {
    return `magda-${type}-${randomUUID()}`;
}

// max allowed S3/MinIO object key length
const MAX_KEY_LENGTH = 1024;

/**
 * Strip characters that are invalid in S3 object key segments.
 * Mirrors the algorithm in magda-typescript-common/src/getStorageUrl.ts.
 */
export function removeInvalidChars(input: string): string {
    if (!input || typeof input !== "string") {
        return "";
    }
    return input.replace(/[^a-zA-Z0-9\-_.]/g, "").replace(/\.+$/, "");
}

/**
 * Build a sanitized S3-safe object key in the `datasetId/distId/fileName`
 * pattern.  Faithfully ports getValidS3ObjectKey from magda-typescript-common
 * using Node built-ins only (no workspace imports).
 */
export function getValidObjectKey(
    datasetId: string,
    distId: string,
    fileName: string
): string {
    let processedDatasetId = removeInvalidChars(datasetId);
    let processedDistId = removeInvalidChars(distId);
    let processedFileName = removeInvalidChars(fileName);

    if (!processedDatasetId.length) {
        throw new UsageError(
            "Failed to create object key: DatasetId after processing is an empty string."
        );
    }
    if (!processedDistId.length) {
        throw new UsageError(
            "Failed to create object key: DistId after processing is an empty string."
        );
    }
    if (!processedFileName.length) {
        processedFileName = `untitled_file_${randomUUID()}.dat`;
    }

    if (processedDatasetId.length > 72) {
        processedDatasetId = createHash("md5").update(datasetId).digest("hex");
    }
    if (processedDistId.length > 72) {
        processedDistId = createHash("md5").update(distId).digest("hex");
    }

    const totalLength =
        processedDatasetId.length +
        processedDistId.length +
        processedFileName.length +
        2;

    if (totalLength < MAX_KEY_LENGTH) {
        return `${processedDatasetId}/${processedDistId}/${processedFileName}`;
    }

    // Key is too long — shorten the fileName part.
    const extNameIdx = processedFileName.lastIndexOf(".");
    if (extNameIdx === -1) {
        return `${processedDatasetId}/${processedDistId}/${processedFileName}`.substring(
            0,
            MAX_KEY_LENGTH
        );
    }

    const extNameLength = processedFileName.length - extNameIdx;
    const extNameLengthDiff = extNameLength - 32;
    if (extNameLengthDiff > 0) {
        processedFileName = processedFileName.substring(
            0,
            processedFileName.length - extNameLengthDiff
        );
        const newTotal =
            processedDatasetId.length +
            processedDistId.length +
            processedFileName.length +
            2;
        if (newTotal < MAX_KEY_LENGTH) {
            return `${processedDatasetId}/${processedDistId}/${processedFileName}`;
        }
    }

    const newExtNameIdx = processedFileName.lastIndexOf(".");
    const newExtName = processedFileName.substring(newExtNameIdx);
    const newFileNameNoExtName = processedFileName.substring(0, newExtNameIdx);
    const excessLength =
        processedDatasetId.length +
        processedDistId.length +
        processedFileName.length +
        2 -
        MAX_KEY_LENGTH;
    return `${processedDatasetId}/${processedDistId}/${newFileNameNoExtName.substring(
        0,
        newFileNameNoExtName.length - excessLength
    )}${newExtName}`;
}

export function storageDownloadUrl(
    datasetId: string,
    distId: string,
    fileName: string
): string {
    const key = getValidObjectKey(datasetId, distId, fileName);
    const parts = key.split("/");
    return "magda://storage-api/" + parts.map(encodeURIComponent).join("/");
}

export function detectFormat(fileName: string): string | undefined {
    const m = /\.([A-Za-z0-9]+)$/.exec(fileName);
    return m ? m[1].toUpperCase() : undefined;
}

export async function parseAspectValue(v: string): Promise<unknown> {
    let raw: string;
    if (v === "-") {
        const chunks: Buffer[] = [];
        for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
        raw = Buffer.concat(chunks).toString("utf8");
    } else if (v.startsWith("@")) {
        raw = await fs.readFile(v.slice(1), "utf8");
    } else {
        raw = v;
    }
    try {
        return JSON.parse(raw);
    } catch {
        throw new UsageError(
            `Invalid JSON for aspect value: ${v.slice(0, 80)}`
        );
    }
}

export async function parseAspectArg(
    v: string
): Promise<{ id: string; data: unknown }> {
    const idx = v.indexOf("=");
    if (idx < 1) {
        throw new UsageError(
            `--aspect must be <id>=<json|@file|-> (got: ${v})`
        );
    }
    return {
        id: v.slice(0, idx),
        data: await parseAspectValue(v.slice(idx + 1))
    };
}

// Match the web client's internal source aspect (id "magda") so datasets
// created by the CLI are picked up by the web dataset-editing UI, but keep a
// distinct `name` so their provenance as CLI-created records stays clear. See
// getInternalDatasetSourceAspectData in the web client's DatasetAddCommon.ts.
function sourceAspect(siteUrl?: string) {
    return {
        id: "magda",
        name: "Magda CLI (mgd)",
        type: "internal",
        ...(siteUrl ? { url: siteUrl } : {})
    };
}

// Derive the site's external URL (as the web client stores in source.url) from
// the profile's API base URL, e.g. "https://x.magda.io/api" -> "https://x.magda.io/".
export function deriveSiteUrl(baseUrl: string): string {
    const trimmed = baseUrl
        .replace(/\/+$/, "")
        .replace(/\/(api\/v0|api|v0)$/i, "");
    return trimmed + "/";
}

function accessControlAspect(owner?: { id?: string; orgUnitId?: string }) {
    if (!owner?.id) return {};
    return {
        "access-control": {
            ownerId: owner.id,
            ...(owner.orgUnitId ? { orgUnitId: owner.orgUnitId } : {}),
            constraintExemption: false
        }
    };
}

export function buildInitialVersionAspect(args: {
    title: string;
    creatorId?: string;
    now: Date;
    internalDataFileUrl?: string;
}) {
    return {
        currentVersionNumber: 0,
        versions: [
            {
                versionNumber: 0,
                createTime: args.now.toISOString(),
                ...(args.creatorId ? { creatorId: args.creatorId } : {}),
                description: "initial version",
                title: args.title,
                ...(args.internalDataFileUrl
                    ? { internalDataFileUrl: args.internalDataFileUrl }
                    : {})
            }
        ]
    };
}

export function appendVersion(
    existing: { currentVersionNumber: number; versions: any[] } | undefined,
    args: {
        title: string;
        creatorId?: string;
        now: Date;
        internalDataFileUrl?: string;
        description: string;
    }
) {
    const base = existing ?? { currentVersionNumber: -1, versions: [] };
    const versionNumber = base.currentVersionNumber + 1;
    return {
        currentVersionNumber: versionNumber,
        versions: [
            ...base.versions,
            {
                versionNumber,
                createTime: args.now.toISOString(),
                ...(args.creatorId ? { creatorId: args.creatorId } : {}),
                description: args.description,
                title: args.title,
                ...(args.internalDataFileUrl
                    ? { internalDataFileUrl: args.internalDataFileUrl }
                    : {})
            }
        ]
    };
}

export function buildDatasetRecord(args: {
    id: string;
    title: string;
    description?: string;
    publish?: boolean;
    owner?: { id?: string; orgUnitId?: string };
    now: Date;
    sourceUrl?: string;
    extraAspects?: Record<string, unknown>;
}) {
    const iso = args.now.toISOString();
    return {
        id: args.id,
        name: args.title,
        aspects: {
            "dcat-dataset-strings": {
                title: args.title,
                description: args.description ?? "",
                issued: iso,
                modified: iso,
                languages: ["eng"]
            },
            publishing: { state: args.publish ? "published" : "draft" },
            ...accessControlAspect(args.owner),
            source: sourceAspect(args.sourceUrl),
            version: buildInitialVersionAspect({
                title: args.title,
                creatorId: args.owner?.id,
                now: args.now
            }),
            "dataset-distributions": { distributions: [] },
            ...args.extraAspects
        } as Record<string, any>
    };
}

export function buildDistributionRecord(args: {
    id: string;
    title: string;
    downloadURL?: string;
    accessURL?: string;
    format?: string;
    byteSize?: number;
    description?: string;
    owner?: { id?: string; orgUnitId?: string };
    publishingState: string;
    now: Date;
    internalDataFileUrl?: string;
    sourceUrl?: string;
    extraAspects?: Record<string, unknown>;
}) {
    const iso = args.now.toISOString();
    const useStorageApi = Boolean(
        args.downloadURL?.startsWith("magda://storage-api/")
    );
    return {
        id: args.id,
        name: args.title,
        aspects: {
            "dcat-distribution-strings": {
                title: args.title,
                ...(args.description ? { description: args.description } : {}),
                issued: iso,
                modified: iso,
                ...(args.downloadURL ? { downloadURL: args.downloadURL } : {}),
                ...(args.accessURL ? { accessURL: args.accessURL } : {}),
                ...(args.format ? { format: args.format } : {}),
                ...(args.byteSize !== undefined
                    ? { byteSize: args.byteSize }
                    : {}),
                ...(useStorageApi ? { useStorageApi: true } : {})
            },
            publishing: { state: args.publishingState },
            ...accessControlAspect(args.owner),
            source: sourceAspect(args.sourceUrl),
            version: buildInitialVersionAspect({
                title: args.title,
                creatorId: args.owner?.id,
                now: args.now,
                internalDataFileUrl: args.internalDataFileUrl
            }),
            ...args.extraAspects
        } as Record<string, any>
    };
}

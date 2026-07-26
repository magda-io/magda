import { MagdaClient } from "./client.js";
import { recordAspect } from "./endpoints.js";
import { MgdApiError } from "./errors.js";
import { note } from "./output.js";

// The application-managed `version` aspect on dataset/distribution records
// (schema: magda-registry-aspects/version.schema.json). The registry never
// touches it; this module ports the web client's maintenance rules
// (RegistryApis.ts getInitialVersionAspectData / tagRecordVersionEventId,
// DatasetAddCommon.ts createVersionForDatasetSubmission). Full design +
// rationale: https://github.com/magda-io/magda/issues/3687.
//
// Key decisions baked into this module (see issue #3687 for the why):
//  - Record-scoped bumps: the CLI is atomic (one command = one mutation), so
//    each command bumps the version of the record it primarily mutates,
//    rather than reproducing the web client's batch-session model.
//  - eventId-gated reconcile: every version item is tagged with the registry
//    `x-magda-event-id` of the mutation it corresponds to (like a git tag on
//    a commit), which is what powers the registry time-travel API. `create`/
//    `add-file` tag the seeded v0 so the first later edit bumps to v1 instead
//    of staying "stuck at 0".
//  - Tag both datasets AND distributions with the mutation's event id. (The
//    web client does the same at submission via updateDataset's
//    tagDistributionVersion flag — an earlier note here claiming it tags
//    datasets only was wrong.)

export type VersionItem = {
    versionNumber: number;
    createTime: string;
    creatorId?: string;
    description: string;
    title: string;
    internalDataFileUrl?: string;
    eventId?: number;
};

export type VersionAspectData = {
    currentVersionNumber: number;
    versions: VersionItem[];
};

export function buildInitialVersionAspect(args: {
    title: string;
    creatorId?: string;
    now: Date;
    internalDataFileUrl?: string;
}): VersionAspectData {
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

export interface VersionBumpArgs {
    eventId: number;
    now: Date;
    title: string;
    creatorId?: string;
    description: string;
    internalDataFileUrl?: string;
    // Always append a new version, bypassing the tag-only branch. Used by
    // `dist replace-file`: a file replacement must be recorded as a new
    // version even on an untagged record, or the new file's
    // internalDataFileUrl would be lost from history.
    forceBump?: boolean;
}

/**
 * The eventId-gated reconcile: tag the untagged current version, bump when
 * the current version already belongs to an earlier event, no-op when this
 * event is already recorded. Pure — never mutates `existing`.
 */
export function reconcileVersion(
    existing: VersionAspectData | undefined,
    args: VersionBumpArgs
): { data: VersionAspectData; changed: boolean } {
    const makeItem = (versionNumber: number): VersionItem => ({
        versionNumber,
        createTime: args.now.toISOString(),
        ...(args.creatorId ? { creatorId: args.creatorId } : {}),
        description: args.description,
        title: args.title,
        ...(args.internalDataFileUrl
            ? { internalDataFileUrl: args.internalDataFileUrl }
            : {}),
        ...(args.eventId ? { eventId: args.eventId } : {})
    });

    if (!existing?.versions?.length) {
        return {
            data: {
                currentVersionNumber: 0,
                versions: [{ ...makeItem(0), description: "initial version" }]
            },
            changed: true
        };
    }

    const current = existing.versions.find(
        (v) => v.versionNumber === existing.currentVersionNumber
    );

    if (
        args.forceBump ||
        !current ||
        (current.eventId && current.eventId !== args.eventId)
    ) {
        const next = makeItem(
            existing.versions.reduce(
                (acc, v) => Math.max(acc, v.versionNumber),
                0
            ) + 1
        );
        return {
            data: {
                currentVersionNumber: next.versionNumber,
                versions: [...existing.versions, next]
            },
            changed: true
        };
    }

    if (!current.eventId && args.eventId) {
        return {
            data: {
                ...existing,
                versions: existing.versions.map((v) =>
                    v === current ? { ...v, eventId: args.eventId } : v
                )
            },
            changed: true
        };
    }

    return { data: existing, changed: false };
}

/**
 * Tag the current version item with a content event id, for records whose
 * `version` aspect the caller just built locally (create/add-file).
 * Returns the updated aspect, or undefined when there is nothing to do.
 * Pure — never mutates `data`.
 */
export function tagCurrentVersion(
    data: VersionAspectData,
    eventId: number
): VersionAspectData | undefined {
    if (!eventId) return undefined;
    const current = data.versions?.find(
        (v) => v.versionNumber === data.currentVersionNumber
    );
    if (!current || current.eventId) return undefined;
    return {
        ...data,
        versions: data.versions.map((v) =>
            v === current ? { ...v, eventId } : v
        )
    };
}

/**
 * PUT the version aspect, best-effort: the content mutation has already
 * succeeded, so a version-maintenance failure only warns (the reconcile is
 * self-healing on the next command).
 */
export async function writeVersionAspect(
    client: MagdaClient,
    recordId: string,
    data: VersionAspectData
): Promise<boolean> {
    try {
        await client.request("PUT", recordAspect(recordId, "version"), {
            headers: { "content-type": "application/json" },
            body: JSON.stringify(data)
        });
        return true;
    } catch (e) {
        note(
            `Warning: failed to update the version aspect of ${recordId}: ${
                e instanceof Error ? e.message : String(e)
            }. The content change was applied; the version aspect will self-heal on the next command.`
        );
        return false;
    }
}

/**
 * GET → reconcile → PUT a record's version aspect. Best-effort throughout;
 * returns the resulting aspect data, or undefined when it could not be
 * read/written. `title` falls back to the current version item's title,
 * then the record id.
 */
export async function bumpRecordVersion(
    client: MagdaClient,
    recordId: string,
    args: Omit<VersionBumpArgs, "title"> & { title?: string }
): Promise<VersionAspectData | undefined> {
    if (!args.eventId) {
        // Without an event id the version can't be tagged, so an edit may go
        // unrecorded (the untagged-current branch is a no-op) — surface it.
        note(
            `Warning: the registry response for ${recordId} did not include ` +
                `an event id; this change may not be recorded in the version history.`
        );
    }
    let fetched: VersionAspectData | undefined;
    try {
        fetched = await client.json<VersionAspectData>(
            "GET",
            recordAspect(recordId, "version")
        );
    } catch (e) {
        if (!(e instanceof MgdApiError && e.status === 404)) {
            note(
                `Warning: could not read the version aspect of ${recordId}: ${
                    e instanceof Error ? e.message : String(e)
                }. Skipping version maintenance for this command.`
            );
            return undefined;
        }
    }
    // Snapshot into a const so the narrowing survives the closure below
    // (strict mode: a captured `let` is not narrowed inside callbacks).
    const existing = fetched;
    const currentTitle = existing
        ? existing.versions?.find(
              (v) => v.versionNumber === existing.currentVersionNumber
          )?.title
        : undefined;
    const { data, changed } = reconcileVersion(existing, {
        ...args,
        title: args.title ?? currentTitle ?? recordId
    });
    if (!changed) return data;
    return (await writeVersionAspect(client, recordId, data))
        ? data
        : undefined;
}

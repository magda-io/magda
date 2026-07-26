/**
 * Pure helpers for the application-managed `version` aspect on dataset and
 * distribution records. The registry never touches this aspect — clients
 * maintain it. The mgd CLI maintains it too (packages/mgd/src/versionAspect.ts),
 * so the arithmetic here must tolerate histories written by either client:
 * always look versions up by `versionNumber` (never array position) and
 * always append with `max(versionNumber) + 1`. See issue #3713.
 *
 * Zero imports on purpose: keeps this module unit-testable in isolation.
 */

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

export const getInitialVersionAspectData = (
    title: string,
    creatorId?: string,
    internalDataFileUrl?: string
): VersionAspectData => ({
    currentVersionNumber: 0,
    versions: [
        {
            versionNumber: 0,
            createTime: new Date().toISOString(),
            creatorId,
            description: "initial version",
            title,
            ...(internalDataFileUrl ? { internalDataFileUrl } : {})
        }
    ]
});

export function findCurrentVersion(
    data?: VersionAspectData
): VersionItem | undefined {
    return data?.versions?.find(
        (v) => v.versionNumber === data.currentVersionNumber
    );
}

export function appendVersion(
    data: VersionAspectData,
    item: Omit<VersionItem, "versionNumber">
): VersionAspectData {
    const versionNumber =
        data.versions.reduce((acc, v) => Math.max(acc, v.versionNumber), 0) + 1;
    return {
        currentVersionNumber: versionNumber,
        versions: [...data.versions, { ...item, versionNumber }]
    };
}

/**
 * Decide a distribution's `version` aspect at dataset submission:
 *
 * - no aspect yet (new distribution)  -> seed the initial v0
 * - metadata not edited this session  -> unchanged
 * - current version untagged          -> unchanged. Covers two cases at once:
 *   a version freshly bumped by a file replacement in this same session (the
 *   metadata bump is subsumed into it), and a legacy record from before
 *   eventId tagging (it gets tagged by this submission and the NEXT edit
 *   bumps — the same graceful-upgrade path the mgd CLI uses).
 * - otherwise                         -> append an untagged
 *   "Distribution metadata updated" version; the submission PUT's event id
 *   tags it via tagRecordVersionEventId.
 */
export function reconcileDistributionVersionOnSubmit(args: {
    version?: VersionAspectData;
    metadataEdited?: boolean;
    title: string;
    creatorId?: string;
    internalDataFileUrl?: string;
}): VersionAspectData {
    const {
        version,
        metadataEdited,
        title,
        creatorId,
        internalDataFileUrl
    } = args;
    if (!version?.versions?.length) {
        return getInitialVersionAspectData(
            title,
            creatorId,
            internalDataFileUrl
        );
    }
    if (!metadataEdited) {
        return version;
    }
    const current = findCurrentVersion(version);
    if (current && !current.eventId) {
        return version;
    }
    return appendVersion(version, {
        createTime: new Date().toISOString(),
        creatorId,
        description: "Distribution metadata updated",
        title
    });
}

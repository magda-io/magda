import {
    getInitialVersionAspectData,
    findCurrentVersion,
    appendVersion,
    reconcileDistributionVersionOnSubmit,
    VersionAspectData
} from "./recordVersionUtils";

function aspect(overrides: Partial<VersionAspectData> = {}): VersionAspectData {
    return {
        currentVersionNumber: 0,
        versions: [
            {
                versionNumber: 0,
                createTime: "2026-01-01T00:00:00.000Z",
                description: "initial version",
                title: "old title"
            }
        ],
        ...overrides
    };
}

describe("findCurrentVersion", () => {
    it("finds the current version by versionNumber, not array position", () => {
        const gappy = aspect({
            currentVersionNumber: 9,
            versions: [
                {
                    versionNumber: 4,
                    createTime: "t",
                    description: "d",
                    title: "a",
                    eventId: 7
                },
                {
                    versionNumber: 9,
                    createTime: "t",
                    description: "d",
                    title: "b"
                }
            ]
        });
        // positional indexing (versions[9]) would return undefined here
        expect(findCurrentVersion(gappy)?.title).toBe("b");
    });

    it("returns undefined for missing data or missing current item", () => {
        expect(findCurrentVersion(undefined)).toBeUndefined();
        expect(
            findCurrentVersion(aspect({ currentVersionNumber: 5 }))
        ).toBeUndefined();
    });
});

describe("appendVersion", () => {
    it("uses max(versionNumber)+1, not currentVersionNumber+1", () => {
        const gappy = aspect({
            currentVersionNumber: 4,
            versions: [
                {
                    versionNumber: 4,
                    createTime: "t",
                    description: "d",
                    title: "a",
                    eventId: 7
                },
                {
                    versionNumber: 9,
                    createTime: "t",
                    description: "d",
                    title: "b"
                }
            ]
        });
        const out = appendVersion(gappy, {
            createTime: "t2",
            description: "Distribution metadata updated",
            title: "c"
        });
        expect(out.currentVersionNumber).toBe(10);
        expect(out.versions).toHaveLength(3);
        expect(out.versions[2].versionNumber).toBe(10);
    });

    it("does not mutate its input", () => {
        const input = aspect();
        appendVersion(input, {
            createTime: "t2",
            description: "d",
            title: "t"
        });
        expect(input.versions).toHaveLength(1);
        expect(input.currentVersionNumber).toBe(0);
    });
});

describe("reconcileDistributionVersionOnSubmit", () => {
    const base = {
        title: "data.csv",
        creatorId: "u1"
    };

    it("seeds an initial v0 when there is no version aspect (new distribution)", () => {
        const out = reconcileDistributionVersionOnSubmit({
            ...base,
            internalDataFileUrl: "magda://storage-api/a/b/c"
        });
        expect(out.currentVersionNumber).toBe(0);
        expect(out.versions[0]).toMatchObject({
            versionNumber: 0,
            description: "initial version",
            title: "data.csv",
            creatorId: "u1",
            internalDataFileUrl: "magda://storage-api/a/b/c"
        });
    });

    it("returns the aspect unchanged when metadata was not edited", () => {
        const version = aspect({
            versions: [{ ...aspect().versions[0], eventId: 7 }]
        });
        const out = reconcileDistributionVersionOnSubmit({
            ...base,
            version,
            metadataEdited: false
        });
        expect(out).toBe(version);
    });

    it("bumps when metadata was edited and the current version is tagged", () => {
        const version = aspect({
            versions: [{ ...aspect().versions[0], eventId: 7 }]
        });
        const out = reconcileDistributionVersionOnSubmit({
            ...base,
            version,
            metadataEdited: true
        });
        expect(out.currentVersionNumber).toBe(1);
        expect(out.versions).toHaveLength(2);
        expect(out.versions[1]).toMatchObject({
            versionNumber: 1,
            description: "Distribution metadata updated",
            title: "data.csv",
            creatorId: "u1"
        });
        // the new current version must be untagged so the submission PUT's
        // event id can tag it
        expect(out.versions[1].eventId).toBeUndefined();
    });

    it("does NOT bump when the current version is untagged (just-replaced or legacy)", () => {
        // covers both: a version freshly bumped by file replacement in this
        // session, and a legacy record from before tagging existed — both get
        // tagged by this submission; the next edit bumps (CLI upgrade path)
        const version = aspect();
        const out = reconcileDistributionVersionOnSubmit({
            ...base,
            version,
            metadataEdited: true
        });
        expect(out).toBe(version);
    });

    it("bumps with max+1 when the current version item is missing", () => {
        const broken = aspect({ currentVersionNumber: 5 });
        const out = reconcileDistributionVersionOnSubmit({
            ...base,
            version: broken,
            metadataEdited: true
        });
        expect(out.currentVersionNumber).toBe(1); // max(0)+1
        expect(out.versions).toHaveLength(2);
    });

    it("does not mutate its input", () => {
        const version = aspect({
            versions: [{ ...aspect().versions[0], eventId: 7 }]
        });
        reconcileDistributionVersionOnSubmit({
            ...base,
            version,
            metadataEdited: true
        });
        expect(version.versions).toHaveLength(1);
    });
});

describe("getInitialVersionAspectData", () => {
    it("builds an untagged v0", () => {
        const v = getInitialVersionAspectData("t", "u1");
        expect(v.currentVersionNumber).toBe(0);
        expect(v.versions[0]).toMatchObject({
            versionNumber: 0,
            description: "initial version",
            title: "t",
            creatorId: "u1"
        });
        expect(v.versions[0].eventId).toBeUndefined();
    });
});

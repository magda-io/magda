import { expect } from "chai";
import {
    buildInitialVersionAspect,
    reconcileVersion,
    tagCurrentVersion,
    VersionAspectData
} from "../versionAspect.js";

const NOW = new Date("2026-07-14T00:00:00.000Z");

function tagged(eventId?: number): VersionAspectData {
    return {
        currentVersionNumber: 0,
        versions: [
            {
                versionNumber: 0,
                createTime: "2026-01-01T00:00:00.000Z",
                description: "initial version",
                title: "old title",
                ...(eventId ? { eventId } : {})
            }
        ]
    };
}

describe("reconcileVersion", () => {
    const baseArgs = {
        eventId: 42,
        now: NOW,
        title: "t",
        creatorId: "u1",
        description: "Version created on update submission"
    };

    it("seeds a tagged v0 when the aspect is absent", () => {
        const { data, changed } = reconcileVersion(undefined, baseArgs);
        expect(changed).to.equal(true);
        expect(data.currentVersionNumber).to.equal(0);
        expect(data.versions).to.have.length(1);
        expect(data.versions[0]).to.include({
            versionNumber: 0,
            description: "initial version",
            title: "t",
            creatorId: "u1",
            eventId: 42
        });
        expect(data.versions[0].createTime).to.equal(NOW.toISOString());
    });

    it("tags an untagged current version without bumping", () => {
        const { data, changed } = reconcileVersion(tagged(), baseArgs);
        expect(changed).to.equal(true);
        expect(data.currentVersionNumber).to.equal(0);
        expect(data.versions).to.have.length(1);
        expect(data.versions[0].eventId).to.equal(42);
        // tag-only keeps the item's original description/title
        expect(data.versions[0].title).to.equal("old title");
    });

    it("bumps when the current version is tagged with a different event", () => {
        const { data, changed } = reconcileVersion(tagged(7), baseArgs);
        expect(changed).to.equal(true);
        expect(data.currentVersionNumber).to.equal(1);
        expect(data.versions).to.have.length(2);
        expect(data.versions[1]).to.include({
            versionNumber: 1,
            eventId: 42,
            title: "t",
            description: "Version created on update submission"
        });
    });

    it("is a no-op when the current version is tagged with the same event", () => {
        const { data, changed } = reconcileVersion(tagged(42), baseArgs);
        expect(changed).to.equal(false);
        expect(data.versions).to.have.length(1);
    });

    it("is a no-op for eventId 0 on an untagged current version", () => {
        const { changed } = reconcileVersion(tagged(), {
            ...baseArgs,
            eventId: 0
        });
        expect(changed).to.equal(false);
    });

    it("bumps for eventId 0 when current is tagged, without writing eventId 0", () => {
        const { data, changed } = reconcileVersion(tagged(7), {
            ...baseArgs,
            eventId: 0
        });
        expect(changed).to.equal(true);
        expect(data.currentVersionNumber).to.equal(1);
        expect(data.versions[1]).to.not.have.property("eventId");
    });

    it("bumps when the current version item is missing", () => {
        const broken: VersionAspectData = {
            currentVersionNumber: 5,
            versions: tagged().versions
        };
        const { data } = reconcileVersion(broken, baseArgs);
        expect(data.currentVersionNumber).to.equal(1); // max(0)+1
        expect(data.versions).to.have.length(2);
    });

    it("uses max(versionNumber)+1 when numbers have gaps", () => {
        const gappy: VersionAspectData = {
            currentVersionNumber: 4,
            versions: [
                { ...tagged(7).versions[0], versionNumber: 4, eventId: 7 },
                { ...tagged().versions[0], versionNumber: 9 }
            ]
        };
        const { data } = reconcileVersion(gappy, baseArgs);
        expect(data.currentVersionNumber).to.equal(10);
    });

    it("forceBump appends even when the current version is untagged", () => {
        const { data } = reconcileVersion(tagged(), {
            ...baseArgs,
            forceBump: true,
            internalDataFileUrl: "magda://storage-api/a/b/c",
            description: "Replaced superseded by a new distribution"
        });
        expect(data.currentVersionNumber).to.equal(1);
        expect(data.versions[1].internalDataFileUrl).to.equal(
            "magda://storage-api/a/b/c"
        );
    });

    it("does not mutate its input", () => {
        const input = tagged();
        reconcileVersion(input, baseArgs);
        expect(input.versions[0]).to.not.have.property("eventId");
    });
});

describe("tagCurrentVersion", () => {
    it("tags an untagged current version", () => {
        const out = tagCurrentVersion(tagged(), 42)!;
        expect(out.versions[0].eventId).to.equal(42);
    });

    it("returns undefined when already tagged, or eventId is 0", () => {
        expect(tagCurrentVersion(tagged(7), 42)).to.equal(undefined);
        expect(tagCurrentVersion(tagged(), 0)).to.equal(undefined);
    });

    it("does not mutate its input", () => {
        const input = tagged();
        tagCurrentVersion(input, 42);
        expect(input.versions[0]).to.not.have.property("eventId");
    });
});

describe("buildInitialVersionAspect", () => {
    it("builds an untagged v0", () => {
        const v = buildInitialVersionAspect({ title: "t", now: NOW });
        expect(v.currentVersionNumber).to.equal(0);
        expect(v.versions[0]).to.include({
            versionNumber: 0,
            description: "initial version",
            title: "t"
        });
        expect(v.versions[0]).to.not.have.property("eventId");
    });
});

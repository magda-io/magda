import { expect } from "chai";
import {
    createId,
    storageDownloadUrl,
    detectFormat,
    buildDatasetRecord,
    buildDistributionRecord,
    removeInvalidChars,
    getValidObjectKey,
    deriveSiteUrl
} from "../recordBuilders.js";

const NOW = new Date("2026-07-05T00:00:00.000Z");

describe("recordBuilders", () => {
    it("creates web-client-compatible ids", () => {
        expect(createId("ds")).to.match(/^magda-ds-[0-9a-f-]{36}$/);
        expect(createId("dist")).to.match(/^magda-dist-[0-9a-f-]{36}$/);
    });

    it("builds magda:// download URLs with sanitized + encoded segments", () => {
        // spaces and invalid chars are stripped before encoding
        expect(
            storageDownloadUrl("magda-ds-x", "magda-dist-y", "my file.csv")
        ).to.equal("magda://storage-api/magda-ds-x/magda-dist-y/myfile.csv");
    });

    describe("removeInvalidChars", () => {
        it("strips spaces and non-S3-safe chars", () => {
            expect(removeInvalidChars("my file.csv")).to.equal("myfile.csv");
            expect(removeInvalidChars("report (v2).csv")).to.equal(
                "reportv2.csv"
            );
            expect(removeInvalidChars("")).to.equal("");
            // trailing dots stripped
            expect(removeInvalidChars("file..")).to.equal("file");
        });
    });

    describe("getValidObjectKey", () => {
        it("sanitizes all three key segments for a typical filename with spaces and parens", () => {
            const key = getValidObjectKey(
                "magda-ds-x",
                "magda-dist-y",
                "my report (v2).csv"
            );
            const [dsSegment, distSegment, fileSegment] = key.split("/");
            // no invalid chars in any segment
            const validPattern = /^[a-zA-Z0-9\-_.]+$/;
            expect(validPattern.test(dsSegment)).to.equal(true);
            expect(validPattern.test(distSegment)).to.equal(true);
            expect(validPattern.test(fileSegment)).to.equal(true);
            // no empty segments (no double slashes)
            expect(key).to.not.include("//");
            // known sanitized output
            expect(key).to.equal("magda-ds-x/magda-dist-y/myreportv2.csv");
        });

        it("replaces empty-after-strip filename with untitled_file_*.dat", () => {
            const key = getValidObjectKey("magda-ds-x", "magda-dist-y", "!!!");
            expect(key).to.match(
                /^magda-ds-x\/magda-dist-y\/untitled_file_[0-9a-f-]{36}\.dat$/
            );
        });

        it("storageDownloadUrl sanitizes the key before encoding", () => {
            const url = storageDownloadUrl(
                "magda-ds-x",
                "magda-dist-y",
                "my file.csv"
            );
            expect(url).to.equal(
                "magda://storage-api/magda-ds-x/magda-dist-y/myfile.csv"
            );
        });
    });

    it("detects formats from extensions", () => {
        expect(detectFormat("a.csv")).to.equal("CSV");
        expect(detectFormat("a.GeoJSON")).to.equal("GEOJSON");
        expect(detectFormat("noext")).to.equal(undefined);
    });

    it("builds a draft dataset record with the web-client aspect set", () => {
        const record = buildDatasetRecord({
            id: "magda-ds-x",
            title: "My Data",
            description: "desc",
            owner: { id: "u1", orgUnitId: "o1" },
            now: NOW,
            sourceUrl: "https://x.magda.io/"
        });
        expect(record.id).to.equal("magda-ds-x");
        expect(record.name).to.equal("My Data");
        expect(record.aspects["dcat-dataset-strings"]).to.deep.equal({
            title: "My Data",
            description: "desc",
            issued: NOW.toISOString(),
            modified: NOW.toISOString(),
            languages: ["eng"]
        });
        expect(record.aspects.publishing).to.deep.equal({ state: "draft" });
        expect(record.aspects["access-control"]).to.deep.equal({
            ownerId: "u1",
            orgUnitId: "o1",
            constraintExemption: false
        });
        expect(record.aspects.source).to.deep.equal({
            id: "magda",
            name: "Magda CLI (mgd)",
            type: "internal",
            url: "https://x.magda.io/"
        });
        expect(record.aspects["dataset-distributions"]).to.deep.equal({
            distributions: []
        });
        expect(record.aspects.version.currentVersionNumber).to.equal(0);
    });

    it("omits source.url when no sourceUrl is given", () => {
        const record = buildDatasetRecord({ id: "x", title: "t", now: NOW });
        expect(record.aspects.source).to.deep.equal({
            id: "magda",
            name: "Magda CLI (mgd)",
            type: "internal"
        });
    });

    it("derives the site URL from the API base URL", () => {
        expect(deriveSiteUrl("https://x.magda.io/api")).to.equal(
            "https://x.magda.io/"
        );
        expect(deriveSiteUrl("https://x.magda.io/api/v0")).to.equal(
            "https://x.magda.io/"
        );
        expect(deriveSiteUrl("https://x.magda.io/v0/")).to.equal(
            "https://x.magda.io/"
        );
        expect(deriveSiteUrl("https://x.magda.io/custom/gw")).to.equal(
            "https://x.magda.io/custom/gw/"
        );
    });

    it("merges custom aspects last", () => {
        const record = buildDatasetRecord({
            id: "x",
            title: "t",
            now: NOW,
            extraAspects: {
                "my-aspect": { a: 1 },
                publishing: { state: "published" }
            }
        });
        expect(record.aspects["my-aspect"]).to.deep.equal({ a: 1 });
        expect(record.aspects.publishing).to.deep.equal({ state: "published" });
    });

    it("builds a storage-backed distribution record", () => {
        const record = buildDistributionRecord({
            id: "magda-dist-y",
            title: "data.csv",
            downloadURL: "magda://storage-api/ds/dist/data.csv",
            format: "CSV",
            byteSize: 42,
            publishingState: "draft",
            owner: { id: "u1" },
            internalDataFileUrl: "magda://storage-api/ds/dist/data.csv",
            now: NOW
        });
        const s = record.aspects["dcat-distribution-strings"];
        expect(s.useStorageApi).to.equal(true);
        expect(s.downloadURL).to.equal("magda://storage-api/ds/dist/data.csv");
        expect(s.byteSize).to.equal(42);
        expect(record.aspects.version.versions[0].internalDataFileUrl).to.equal(
            "magda://storage-api/ds/dist/data.csv"
        );
    });
});

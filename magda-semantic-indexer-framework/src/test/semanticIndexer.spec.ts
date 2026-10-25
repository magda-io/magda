import { expect } from "chai";
import {
    STORAGE_OBJECT_ASPECTS,
    STORAGE_OBJECT_OPTIONAL_ASPECTS,
    createProcessingContext
} from "../semanticIndexer.js";
import { createRecord } from "./helpers.js";

describe("semanticIndexer", () => {
    it("should not require the dataset-format aspect for storage objects", () => {
        expect(STORAGE_OBJECT_ASPECTS).to.deep.equal([
            "dcat-distribution-strings"
        ]);
        expect(STORAGE_OBJECT_OPTIONAL_ASPECTS).to.deep.equal([
            "dataset-format"
        ]);
    });

    it("should report the DCAT format in diagnostics when dataset-format is missing", () => {
        const context = createProcessingContext(
            { id: "indexer", itemType: "storageObject" } as any,
            createRecord({
                id: "dist1",
                aspects: {
                    "dcat-distribution-strings": {
                        format: "CSV",
                        downloadURL: "magda://storage-api/ds1/dist1/file.csv"
                    }
                }
            })
        );
        expect(context.format).to.equal("CSV");
        expect(context.downloadUrl).to.equal(
            "magda://storage-api/ds1/dist1/file.csv"
        );
    });

    it("should prefer dataset-format in diagnostics when present", () => {
        const context = createProcessingContext(
            { id: "indexer", itemType: "storageObject" } as any,
            createRecord({
                id: "dist1",
                aspects: {
                    "dataset-format": { format: "XLSX" },
                    "dcat-distribution-strings": { format: "CSV" }
                }
            })
        );
        expect(context.format).to.equal("XLSX");
    });
});

import { parseDataset, parseDistribution, RawDistribution } from "./record";
import { DEFAULT_OPTIONAL_DISTRIBUTION_FETCH_ASPECT_LIST } from "../api-clients/RegistryApis";

jest.mock("../config", () => ({
    config: {},
    DATASETS_BUCKET: "magda-datasets"
}));

const dataDictionary = {
    schemaVersion: "1.0",
    provenance: { method: "manual", reviewStatus: "reviewed" },
    entities: [
        {
            id: "observations",
            name: "Observations",
            fields: [
                { path: "site_id", name: "site_id", type: "string" },
                {
                    path: "location.latitude",
                    name: "latitude",
                    type: "number"
                }
            ]
        }
    ]
};

function rawDistribution(aspects: Record<string, any> = {}): RawDistribution {
    return {
        id: "dist-1",
        name: "Observations CSV",
        aspects: {
            "dcat-distribution-strings": {
                format: "CSV",
                downloadURL: "https://example.com/observations.csv"
            },
            ...aspects
        }
    } as any;
}

describe("data-dictionary aspect parsing", () => {
    it("is requested by the normal distribution page fetch", () => {
        expect(DEFAULT_OPTIONAL_DISTRIBUTION_FETCH_ASPECT_LIST).toContain(
            "data-dictionary"
        );
    });

    it("leaves dataDictionary undefined when the aspect is absent", () => {
        const parsed = parseDistribution(rawDistribution());
        expect(parsed.dataDictionary).toBeUndefined();
        // existing parsed properties are unaffected
        expect(parsed.format).toBe("CSV");
        expect(parsed.downloadURL).toBe("https://example.com/observations.csv");
        expect(parsed.compatiblePreviews.table).toBe(true);
    });

    it("leaves dataDictionary undefined for the empty default distribution", () => {
        expect(parseDistribution().dataDictionary).toBeUndefined();
    });

    it("exposes a typed dataDictionary when the aspect is present", () => {
        const parsed = parseDistribution(
            rawDistribution({ "data-dictionary": dataDictionary })
        );
        expect(parsed.dataDictionary?.schemaVersion).toBe("1.0");
        expect(parsed.dataDictionary?.provenance?.method).toBe("manual");
        expect(
            parsed.dataDictionary?.entities[0].fields.map((f) => f.path)
        ).toEqual(["site_id", "location.latitude"]);
    });

    it("ignores unusable aspect data instead of throwing", () => {
        expect(
            parseDistribution(rawDistribution({ "data-dictionary": "oops" }))
                .dataDictionary
        ).toBeUndefined();
        expect(
            parseDistribution(
                rawDistribution({
                    "data-dictionary": { schemaVersion: "1.0" }
                })
            ).dataDictionary
        ).toBeUndefined();
    });

    it("exposes dataDictionary on dataset distributions", () => {
        const dataset = parseDataset({
            id: "ds-1",
            name: "Dataset",
            aspects: {
                "dcat-dataset-strings": { title: "Dataset" },
                "dataset-distributions": {
                    distributions: [
                        rawDistribution({ "data-dictionary": dataDictionary }),
                        { ...rawDistribution(), id: "dist-2" }
                    ]
                }
            }
        } as any);
        expect(dataset.distributions[0].dataDictionary?.entities).toHaveLength(
            1
        );
        expect(dataset.distributions[1].dataDictionary).toBeUndefined();
    });
});

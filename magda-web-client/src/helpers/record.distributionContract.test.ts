import { parseDataset, parseDistribution, RawDistribution } from "./record";
import { DEFAULT_OPTIONAL_DISTRIBUTION_FETCH_ASPECT_LIST } from "../api-clients/RegistryApis";
import openApiContract from "@magda/registry-aspects/examples/distribution-contract/openapi-rest-query.json";

jest.mock("../config", () => ({
    config: {},
    DATASETS_BUCKET: "magda-datasets"
}));

function rawDistribution(aspects: Record<string, any> = {}): RawDistribution {
    return {
        id: "dist-1",
        name: "Occurrence API",
        aspects: {
            "dcat-distribution-strings": {
                format: "JSON",
                accessURL: "https://example.org/api"
            },
            ...aspects
        }
    } as any;
}

describe("distribution-contract aspect parsing", () => {
    it("is requested by the normal distribution page fetch", () => {
        expect(DEFAULT_OPTIONAL_DISTRIBUTION_FETCH_ASPECT_LIST).toContain(
            "distribution-contract"
        );
    });

    it("leaves distributionContract undefined when the aspect is absent", () => {
        const parsed = parseDistribution(rawDistribution());
        expect(parsed.distributionContract).toBeUndefined();
        // existing parsed properties are unaffected
        expect(parsed.format).toBe("JSON");
        expect(parsed.accessURL).toBe("https://example.org/api");
    });

    it("leaves distributionContract undefined for the empty default distribution", () => {
        expect(parseDistribution().distributionContract).toBeUndefined();
    });

    it("exposes a typed, normalized distributionContract when the aspect is present", () => {
        const parsed = parseDistribution(
            rawDistribution({ "distribution-contract": openApiContract })
        );
        expect(parsed.distributionContract).toEqual(openApiContract);
        expect(parsed.distributionContract?.protocol).toBe("REST");
        expect(
            parsed.distributionContract?.operations?.map((op) => op.id)
        ).toEqual(["search-occurrences", "advanced-search", "get-occurrence"]);
    });

    it("ignores unusable or unsupported aspect data instead of throwing", () => {
        [
            "oops",
            null,
            {},
            { ...openApiContract, schemaVersion: "2.0" }
        ].forEach((aspect) =>
            expect(
                parseDistribution(
                    rawDistribution({ "distribution-contract": aspect })
                ).distributionContract
            ).toBeUndefined()
        );
    });

    it("exposes distributionContract on dataset distributions", () => {
        const dataset = parseDataset({
            id: "ds-1",
            name: "Dataset",
            aspects: {
                "dcat-dataset-strings": { title: "Dataset" },
                "dataset-distributions": {
                    distributions: [
                        rawDistribution({
                            "distribution-contract": openApiContract
                        }),
                        { ...rawDistribution(), id: "dist-2" }
                    ]
                }
            }
        } as any);
        expect(
            dataset.distributions[0].distributionContract?.operations
        ).toHaveLength(3);
        expect(dataset.distributions[1].distributionContract).toBeUndefined();
    });
});

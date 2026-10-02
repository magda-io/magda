import React from "react";
import { createRoot, Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import csvTable from "@magda/registry-aspects/examples/data-dictionary/csv-table.json";
import { parseDistribution } from "helpers/record";
import DistributionDetails from "./DistributionDetails";

// Ensure the components and `react-dom` share one React instance (hooks need
// it) whichever node_modules layout the workspace install produced.
jest.mock("react", () =>
    jest.requireActual(
        require.resolve("react", {
            paths: [require.resolve("react-dom")]
        })
    )
);

jest.mock("config", () => ({
    config: {},
    DATASETS_BUCKET: "magda-datasets"
}));

jest.mock("Components/Common/DataPreviewVis", () => {
    const React = jest.requireActual("react");
    return {
        __esModule: true,
        default: () => <div className="mock-preview-vis" />,
        mergeDatasetAndDistributionPreviewSettings: (dist: any) => dist
    };
});

jest.mock("Components/Common/DataPreviewMap", () => {
    const React = jest.requireActual("react");
    return {
        __esModule: true,
        default: () => <div className="mock-preview-map" />,
        isSupportedFormat: () => false
    };
});

jest.mock("Components/Common/ContactPoint", () => () => null);
jest.mock("Components/Dataset/View/DiscourseComments", () => () => null);
jest.mock("helpers/getStorageApiResourceAccessUrl", () => (url: string) => url);
jest.mock("../../../externalPluginComponents", () => ({
    getPluginExtraVisualisationSections: () => []
}));

let container: HTMLDivElement;
let root: Root;

function render(rawDistribution: any) {
    act(() => {
        root.render(
            <DistributionDetails
                dataset={{ identifier: "ds-1", rawData: {} } as any}
                distribution={parseDistribution(rawDistribution)}
            />
        );
    });
}

function rawDistribution(
    dcat: Record<string, any>,
    aspects: Record<string, any> = {}
) {
    return {
        id: "dist-1",
        name: "Observations",
        aspects: {
            "dcat-distribution-strings": { format: "CSV", ...dcat },
            ...aspects
        }
    };
}

beforeAll(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
});

afterEach(() => {
    act(() => root.unmount());
    container.remove();
});

describe("DistributionDetails data dictionary section", () => {
    it("renders existing distributions without the aspect unchanged", () => {
        render(rawDistribution({ downloadURL: "https://example.com/a.csv" }));
        expect(container.querySelector(".data-dictionary")).toBeNull();
        expect(container.querySelector(".mock-preview-vis")).not.toBeNull();
        expect(container.querySelector(".mock-preview-map")).not.toBeNull();
        expect(container.textContent).toContain("https://example.com/a.csv");
    });

    it("renders the Structure section alongside the previews", () => {
        render(
            rawDistribution(
                { downloadURL: "https://example.com/a.csv" },
                { "data-dictionary": csvTable }
            )
        );
        expect(container.querySelector(".data-dictionary")).not.toBeNull();
        expect(container.querySelector(".mock-preview-vis")).not.toBeNull();
        expect(container.querySelector(".mock-preview-map")).not.toBeNull();
    });

    it("renders the Structure section for a non-previewable distribution", () => {
        // no downloadURL / accessURL: the preview block is not rendered
        render(rawDistribution({}, { "data-dictionary": csvTable }));
        expect(container.querySelector(".distribution-preview")).toBeNull();
        const section = container.querySelector(".data-dictionary");
        expect(section).not.toBeNull();
        expect(section?.querySelector("h3")?.textContent).toBe("Structure");
        expect(
            section?.querySelectorAll("tr.data-dictionary__field")
        ).toHaveLength(4);
    });

    it("does not render a section for unusable aspect data", () => {
        render(rawDistribution({}, { "data-dictionary": { foo: "bar" } }));
        expect(container.querySelector(".data-dictionary")).toBeNull();
    });

    it("does not interpret an unsupported schema version with v1 semantics", () => {
        render(
            rawDistribution(
                { downloadURL: "https://example.com/a.csv" },
                { "data-dictionary": { ...csvTable, schemaVersion: "2.0" } }
            )
        );
        expect(container.querySelector(".data-dictionary")).toBeNull();
        // the rest of the page still renders
        expect(container.querySelector(".mock-preview-vis")).not.toBeNull();
    });

    it("renders malformed nested aspect data without crashing", () => {
        const bad = { not: "a string" };
        render(
            rawDistribution(
                {},
                {
                    "data-dictionary": {
                        schemaVersion: "1.0",
                        provenance: { method: bad },
                        entities: [
                            {
                                id: "e",
                                name: bad,
                                fields: [
                                    {
                                        path: "a",
                                        name: "a",
                                        type: bad,
                                        roles: [bad],
                                        valueDomain: {
                                            values: [{ value: bad }]
                                        }
                                    }
                                ]
                            }
                        ],
                        relationships: [{ source: bad, target: bad }]
                    }
                }
            )
        );
        expect(
            container.querySelectorAll("tr.data-dictionary__field")
        ).toHaveLength(1);
        expect(container.textContent).toContain("unknown");
    });
});

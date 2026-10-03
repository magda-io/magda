import React from "react";
import { createRoot, Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import csvTable from "@magda/registry-aspects/examples/data-dictionary/csv-table.json";
import openApiDictionary from "@magda/registry-aspects/examples/data-dictionary/openapi-request-response.json";
import openApiContract from "@magda/registry-aspects/examples/distribution-contract/openapi-rest-query.json";
import httpDownloadContract from "@magda/registry-aspects/examples/distribution-contract/http-download.json";
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
    window.history.replaceState(null, "", "/");
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

    it("renders the Structure section after the previews", () => {
        render(
            rawDistribution(
                { downloadURL: "https://example.com/a.csv" },
                { "data-dictionary": csvTable }
            )
        );
        const section = container.querySelector(".data-dictionary");
        const preview = container.querySelector(".distribution-preview");
        expect(section).not.toBeNull();
        expect(container.querySelector(".mock-preview-vis")).not.toBeNull();
        expect(container.querySelector(".mock-preview-map")).not.toBeNull();
        expect(
            preview!.compareDocumentPosition(section!) &
                Node.DOCUMENT_POSITION_FOLLOWING
        ).toBeTruthy();
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

describe("DistributionDetails How to use section", () => {
    function isAfter(first: Element, second: Element) {
        return !!(
            first.compareDocumentPosition(second) &
            Node.DOCUMENT_POSITION_FOLLOWING
        );
    }

    it("renders existing distributions without the aspect unchanged", () => {
        render(rawDistribution({ downloadURL: "https://example.com/a.csv" }));
        expect(container.querySelector(".distribution-contract")).toBeNull();
        expect(container.querySelector(".mock-preview-vis")).not.toBeNull();
    });

    it("renders Structure and How to use as tabs after the previews", () => {
        render(
            rawDistribution(
                { downloadURL: "https://example.com/a.csv" },
                {
                    "data-dictionary": csvTable,
                    "distribution-contract": httpDownloadContract
                }
            )
        );
        const preview = container.querySelector(".distribution-preview")!;
        const structure = container.querySelector(".data-dictionary")!;
        const howToUse = container.querySelector(".distribution-contract")!;
        expect(howToUse).not.toBeNull();
        expect(howToUse.querySelector("h3")?.textContent).toBe("How to use");
        expect(container.querySelector(".mock-preview-vis")).not.toBeNull();
        expect(container.querySelector(".mock-preview-map")).not.toBeNull();
        expect(isAfter(preview, structure)).toBe(true);
        expect(isAfter(structure, howToUse)).toBe(true);
        const tabs = Array.from(
            container.querySelectorAll(".data-understanding [role='tab']")
        );
        expect(tabs.map((tab) => tab.textContent)).toEqual([
            "Structure",
            "How to use"
        ]);
        expect(isAfter(preview, tabs[0])).toBe(true);
        // Structure is selected by default
        expect(
            structure.closest("[role='tabpanel']")!.hasAttribute("hidden")
        ).toBe(false);
        expect(
            howToUse.closest("[role='tabpanel']")!.hasAttribute("hidden")
        ).toBe(true);
    });

    it("renders How to use for a non-previewable distribution", () => {
        // no downloadURL / accessURL: the preview block is not rendered
        render(
            rawDistribution({}, { "distribution-contract": openApiContract })
        );
        expect(container.querySelector(".distribution-preview")).toBeNull();
        expect(container.querySelector(".data-dictionary")).toBeNull();
        expect(
            Array.from(
                container.querySelectorAll(".data-understanding [role='tab']")
            ).map((tab) => tab.textContent)
        ).toEqual(["How to use"]);
        expect(
            container.querySelectorAll(".distribution-contract__operation")
        ).toHaveLength(3);
    });

    it("does not render How to use for unusable or unsupported aspect data", () => {
        render(
            rawDistribution(
                { downloadURL: "https://example.com/a.csv" },
                {
                    "distribution-contract": {
                        ...openApiContract,
                        schemaVersion: "2.0"
                    }
                }
            )
        );
        expect(container.querySelector(".distribution-contract")).toBeNull();
        // the rest of the page still renders
        expect(container.querySelector(".mock-preview-vis")).not.toBeNull();
        render(rawDistribution({}, { "distribution-contract": "oops" }));
        expect(container.querySelector(".distribution-contract")).toBeNull();
    });

    it("shows a request/response entity in Structure when its link is followed", () => {
        render(
            rawDistribution(
                {},
                {
                    "data-dictionary": openApiDictionary,
                    "distribution-contract": openApiContract
                }
            )
        );
        const selectedEntity = () =>
            container
                .querySelector(".data-dictionary__entity")
                ?.getAttribute("data-entity-id");
        const searchInput = () =>
            container.querySelector<HTMLInputElement>(
                '.data-dictionary input[type="search"]'
            )!;
        const entityLink = (operationId: string, entityId: string) =>
            container.querySelector<HTMLButtonElement>(
                `[data-operation-id="${operationId}"] button[data-entity-id="${entityId}"]`
            )!;

        expect(selectedEntity()).toBe("search-request");
        // a search that hides the target entity's fields is cleared
        act(() => {
            const setter = Object.getOwnPropertyDescriptor(
                HTMLInputElement.prototype,
                "value"
            )!.set!;
            setter.call(searchInput(), "boundingBox");
            searchInput().dispatchEvent(new Event("input", { bubbles: true }));
        });
        expect(searchInput().value).toBe("boundingBox");

        act(() =>
            entityLink("search-occurrences", "occurrence-record").click()
        );
        expect(
            container
                .querySelector("#data-understanding-tab-structure")
                ?.getAttribute("aria-selected")
        ).toBe("true");
        expect(selectedEntity()).toBe("occurrence-record");
        expect(searchInput().value).toBe("");
        expect(document.activeElement).toBe(
            container.querySelector(".data-dictionary")
        );

        act(() => entityLink("advanced-search", "search-request").click());
        expect(selectedEntity()).toBe("search-request");

        // following the same link again re-selects the entity
        act(() =>
            Array.from(
                container.querySelectorAll<HTMLButtonElement>(
                    '.data-dictionary [role="tab"]'
                )
            )[1].click()
        );
        expect(selectedEntity()).toBe("occurrence-record");
        act(() => entityLink("advanced-search", "search-request").click());
        expect(selectedEntity()).toBe("search-request");
    });
});

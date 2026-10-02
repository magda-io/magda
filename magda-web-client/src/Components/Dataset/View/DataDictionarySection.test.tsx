import React from "react";
import { createRoot, Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { DataDictionaryAspect } from "@magda/typescript-common/dist/data-dictionary/model.js";
import csvTable from "@magda/registry-aspects/examples/data-dictionary/csv-table.json";
import excelMultiSheet from "@magda/registry-aspects/examples/data-dictionary/excel-multi-sheet.json";
import openApi from "@magda/registry-aspects/examples/data-dictionary/openapi-request-response.json";
import arcgis from "@magda/registry-aspects/examples/data-dictionary/arcgis-feature-layer.json";
import mixedProvenance from "@magda/registry-aspects/examples/data-dictionary/manual-override-mixed-provenance.json";
import reservedPaths from "@magda/registry-aspects/examples/data-dictionary/reserved-character-paths.json";
import netcdf from "@magda/registry-aspects/examples/data-dictionary/netcdf-dimensions.json";
import { normalizeDataDictionary } from "@magda/typescript-common/dist/data-dictionary/normalize.js";
import DataDictionarySection, {
    describeProvenance,
    describeSample,
    fieldMatchesQuery
} from "./DataDictionarySection";

// Ensure the component and `react-dom` share one React instance (hooks need
// it) whichever node_modules layout the workspace install produced.
jest.mock("react", () =>
    jest.requireActual(
        require.resolve("react", {
            paths: [require.resolve("react-dom")]
        })
    )
);

let container: HTMLDivElement;
let root: Root;

function render(dictionary: unknown) {
    act(() => {
        root.render(
            <DataDictionarySection
                dataDictionary={dictionary as DataDictionaryAspect}
            />
        );
    });
}

function fieldRows() {
    return Array.from(
        container.querySelectorAll<HTMLTableRowElement>(
            "tr.data-dictionary__field"
        )
    );
}

function fieldPaths() {
    return fieldRows().map((row) => row.getAttribute("data-field-path"));
}

function rowFor(path: string) {
    const row = fieldRows().find(
        (item) => item.getAttribute("data-field-path") === path
    );
    if (!row) {
        throw new Error(`No row for field path ${path}`);
    }
    return row;
}

function search(text: string) {
    const input = container.querySelector<HTMLInputElement>(
        'input[type="search"]'
    )!;
    act(() => {
        const setter = Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            "value"
        )!.set!;
        setter.call(input, text);
        input.dispatchEvent(new Event("input", { bubbles: true }));
    });
}

function entityTabs() {
    return Array.from(
        container.querySelectorAll<HTMLButtonElement>('[role="tab"]')
    );
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

describe("DataDictionarySection", () => {
    it("renders a flat tabular dictionary", () => {
        render(csvTable);
        expect(container.querySelector("h3")?.textContent).toBe("Structure");
        expect(container.textContent).toContain(
            "Data dictionary: 1 entity, 4 fields."
        );
        // a single entity needs no selector
        expect(entityTabs()).toHaveLength(0);
        expect(fieldPaths()).toEqual([
            "observation_id",
            "observed_at",
            "temperature",
            "quality_flag"
        ]);
        const id = rowFor("observation_id");
        expect(id.textContent).toContain("primary key");
        expect(id.textContent).toContain("identifier");
        expect(id.textContent).toContain("Required");
        const temperature = rowFor("temperature");
        expect(temperature.textContent).toContain("number");
        expect(temperature.textContent).toContain("Source: number");
        expect(temperature.textContent).toContain("Cel");
        expect(temperature.textContent).toContain("Nullable");
        expect(temperature.textContent).toContain("Values: -60 – 60");
        expect(rowFor("quality_flag").textContent).toContain(
            "Allowed values: good, suspect, bad"
        );
        // dictionary level provenance & native schema link
        expect(container.textContent).toContain(
            "Authoritative source · Unreviewed"
        );
        const link = container.querySelector<HTMLAnchorElement>(
            ".data-dictionary__source-links a"
        );
        expect(link?.href).toBe("https://example.org/observations.schema.json");
        expect(link?.textContent).toBe("Native schema / specification");
    });

    it("renders nested fields with stable paths and indentation", () => {
        render(openApi);
        const tabs = entityTabs();
        expect(tabs.map((tab) => tab.textContent)).toEqual([
            "Search request 3",
            "Occurrence 7"
        ]);
        act(() => tabs[1].click());
        expect(fieldPaths()).toContain("location.latitude");
        const latitude = rowFor("location.latitude");
        expect(latitude.getAttribute("data-depth")).toBe("1");
        expect(
            latitude.querySelector(".data-dictionary__path")?.textContent
        ).toBe("location.latitude");
        expect(latitude.textContent).toContain(
            "Concept: http://rs.tdwg.org/dwc/terms/decimalLatitude"
        );
        expect(rowFor("location").getAttribute("data-depth")).toBe("0");
        expect(rowFor("measurements[].value").getAttribute("data-depth")).toBe(
            "1"
        );
        // no raw JSON schema is dumped
        expect(container.textContent).not.toContain("$ref");
    });

    it("supports entity selection, relationships and keys for multiple entities", () => {
        render(excelMultiSheet);
        const tabs = entityTabs();
        expect(tabs).toHaveLength(2);
        expect(tabs[0].getAttribute("aria-selected")).toBe("true");
        expect(fieldPaths()).toEqual(["observation_id", "site_id", "value"]);
        expect(container.textContent).toContain(
            "Observations (site_id) → Sites (id)"
        );
        act(() => tabs[1].click());
        expect(entityTabs()[1].getAttribute("aria-selected")).toBe("true");
        expect(fieldPaths()).toEqual(["id", "name"]);
        expect(container.textContent).toContain("Primary key: id");
        // relationships are listed for the referenced entity too
        expect(container.textContent).toContain(
            "Observations (site_id) → Sites (id)"
        );
        expect(container.textContent).toContain(
            "Manual / custodian · Reviewed"
        );
    });

    it("searches fields across entities", () => {
        render(excelMultiSheet);
        search("name");
        expect(entityTabs().map((tab) => tab.textContent)).toEqual([
            "Observations 0 matches",
            "Sites 1 match"
        ]);
        expect(container.textContent).toContain('No fields match "name".');
        act(() => entityTabs()[1].click());
        expect(fieldPaths()).toEqual(["name"]);
        search("");
        expect(fieldPaths()).toEqual(["id", "name"]);
    });

    it("matches search terms against descriptions, concepts and units", () => {
        render(arcgis);
        search("inactive");
        expect(fieldPaths()).toEqual([]);
        search("ha");
        expect(fieldPaths()).toEqual(["HECTARES"]);
        search("area");
        expect(fieldPaths()).toEqual(["HECTARES"]);
    });

    it("renders geometry and coded value domains", () => {
        render(arcgis);
        expect(container.textContent).toContain(
            "Geometry: Polygon (EPSG:4326) — field geometry"
        );
        const status = rowFor("STATUS");
        expect(status.textContent).toContain("Status");
        expect(status.textContent).toContain("(STATUS)");
        expect(status.textContent).toContain("Codes: A = Active, I = Inactive");
        expect(rowFor("HECTARES").textContent).toContain("Range: 0 – 100000");
        expect(rowFor("geometry").textContent).toContain("primary-geometry");
    });

    it("renders dimensions of multidimensional variables", () => {
        render(netcdf);
        expect(container.textContent).toContain(
            "Dimensions: time [365, unlimited], lat (latitude) [720], lon (longitude) [1440]"
        );
        expect(rowFor("temperature").textContent).toContain(
            "Dimensions: time × lat × lon"
        );
    });

    it("shows node- and property-level provenance", () => {
        render(mixedProvenance);
        const commodity = rowFor("commodity");
        const badges = Array.from(
            commodity.querySelectorAll(".data-dictionary__provenance")
        ).map((badge) => badge.textContent);
        expect(badges).toEqual([
            "Authoritative source · Unreviewed",
            "description: Manual / custodian · Custodian-approved",
            "semanticConcept: Manual / custodian · Custodian-approved"
        ]);
        const year = rowFor("year");
        expect(year.textContent).toContain(
            "description: Agent-generated · Unreviewed"
        );
        expect(
            year.querySelector(".data-dictionary__provenance--advisory")
        ).not.toBeNull();
        expect(rowFor("notes").textContent).toContain(
            "Manual / custodian · Custodian-approved"
        );
    });

    it("displays escaped reserved-character paths and inferred sample extent", () => {
        render(reservedPaths);
        expect(fieldPaths()).toEqual([
            "a\\.b",
            "field\\[\\]",
            "back\\\\slash",
            "Site Name"
        ]);
        const dotted = rowFor("a\\.b");
        // a literal flat field named "a.b" is not shown as nested
        expect(dotted.getAttribute("data-depth")).toBe("0");
        expect(dotted.querySelector("strong")?.textContent).toBe("a.b");
        expect(
            dotted.querySelector(".data-dictionary__path")?.textContent
        ).toBe("a\\.b");
        expect(container.textContent).toContain(
            "Inferred from a sample of 100 rows / 64 KB; may not be complete."
        );
        expect(
            container.querySelector(
                ".data-dictionary__source .data-dictionary__provenance--advisory"
            )
        ).not.toBeNull();
    });

    it("selects entities by position when ids are duplicated", () => {
        render(
            normalizeDataDictionary({
                schemaVersion: "1.0",
                entities: [
                    {
                        id: "dup",
                        name: "First",
                        fields: [
                            { path: "a", name: "a", type: "string" },
                            { path: "a", name: "a", type: "integer" }
                        ]
                    },
                    {
                        id: "dup",
                        name: "Second",
                        fields: [{ path: "b", name: "b", type: "string" }]
                    }
                ]
            })
        );
        expect(fieldPaths()).toEqual(["a", "a"]);
        act(() => entityTabs()[1].click());
        expect(entityTabs()[1].getAttribute("aria-selected")).toBe("true");
        expect(entityTabs()[0].getAttribute("aria-selected")).toBe("false");
        expect(fieldPaths()).toEqual(["b"]);
    });

    it("cannot be crashed by malformed nested metadata once normalized", () => {
        const bad = { nested: { object: true } };
        const provenance = { method: bad, reviewStatus: [bad], sample: bad };
        const hostileField = {
            path: "x",
            name: bad,
            type: bad,
            title: bad,
            roles: [bad, "identifier"],
            aliases: [bad],
            format: bad,
            sourceType: bad,
            description: bad,
            semanticConcept: bad,
            unit: bad,
            enum: [bad, "ok"],
            missingValues: [bad],
            minimum: bad,
            maximum: bad,
            minLength: bad,
            pattern: bad,
            required: bad,
            dimensions: [bad, "t"],
            valueDomain: {
                uri: bad,
                name: bad,
                values: [bad, { value: bad, label: bad }, { value: "A" }],
                minimum: bad
            },
            provenance,
            propertyProvenance: { description: bad, unit: provenance }
        };
        const raw = {
            schemaVersion: "1.0",
            source: { type: bad, url: bad, retrievedAt: bad },
            provenance,
            entities: [
                {
                    id: "e1",
                    name: bad,
                    role: bad,
                    description: bad,
                    primaryKey: [bad, "x"],
                    geometry: { type: bad, crs: bad, fieldPath: bad },
                    dimensions: [bad, { id: "t", name: bad, size: bad }],
                    provenance,
                    fields: [hostileField, bad, null]
                },
                { id: "e2", name: "Second", fields: [hostileField] }
            ],
            relationships: [
                bad,
                {
                    id: bad,
                    type: bad,
                    description: bad,
                    source: { entity: "e2", fields: [bad, "x"] },
                    target: { entity: bad, fields: ["x"] }
                },
                {
                    id: "r",
                    source: { entity: "e1", fields: ["x"] },
                    target: { entity: "e2", fields: ["x"] }
                }
            ]
        };
        expect(() => render(normalizeDataDictionary(raw))).not.toThrow();
        expect(fieldPaths()).toEqual(["x"]);
        expect(rowFor("x").textContent).toContain("identifier");
        expect(rowFor("x").textContent).toContain("Codes: A");
        expect(container.textContent).toContain("e1 (x) → Second (x)");
        // structured enum values are kept and shown as JSON
        expect(rowFor("x").textContent).toContain('{"nested":{"object":true}}');
        search("x");
        act(() => entityTabs()[1].click());
        expect(fieldPaths()).toEqual(["x"]);
    });

    it("handles a dictionary without entities", () => {
        render({ schemaVersion: "1.0", entities: [] });
        expect(container.textContent).toContain(
            "No field-level structure is described for this distribution."
        );
        expect(container.querySelector("table")).toBeNull();
        expect(container.querySelector('input[type="search"]')).toBeNull();
    });
});

describe("DataDictionarySection helpers", () => {
    it("describes provenance including unknown open-vocabulary values", () => {
        expect(describeProvenance(undefined)).toBe("Unknown origin");
        expect(describeProvenance({})).toBe("Unknown origin");
        expect(
            describeProvenance({
                method: "future-method",
                reviewStatus: "future-status"
            })
        ).toBe("future-method · future-status");
    });

    it("describes sample extent", () => {
        expect(describeSample(undefined)).toBeUndefined();
        expect(describeSample({ sample: {} })).toBeUndefined();
        expect(describeSample({ sample: { rows: 5 } })).toBe(
            "Inferred from a sample of 5 rows; may not be complete."
        );
    });

    it("matches all query terms", () => {
        const field = {
            path: "properties.location.latitude",
            name: "latitude",
            type: "number",
            aliases: ["lat"]
        };
        expect(fieldMatchesQuery(field, "")).toBe(true);
        expect(fieldMatchesQuery(field, "LOCATION lat")).toBe(true);
        expect(fieldMatchesQuery(field, "location longitude")).toBe(false);
    });
});

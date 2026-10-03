import React from "react";
import { createRoot, Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { DistributionContractAspect } from "@magda/typescript-common/dist/distribution-contract/model.js";
import { normalizeDistributionContract } from "@magda/typescript-common/dist/distribution-contract/normalize.js";
import { DataDictionaryAspect } from "@magda/typescript-common/dist/data-dictionary/model.js";
import httpDownload from "@magda/registry-aspects/examples/distribution-contract/http-download.json";
import openApi from "@magda/registry-aspects/examples/distribution-contract/openapi-rest-query.json";
import arcgis from "@magda/registry-aspects/examples/distribution-contract/arcgis-feature-service.json";
import ogcStac from "@magda/registry-aspects/examples/distribution-contract/ogc-stac-query.json";
import authenticated from "@magda/registry-aspects/examples/distribution-contract/authenticated-restricted.json";
import mixedProvenance from "@magda/registry-aspects/examples/distribution-contract/mixed-provenance.json";
import openApiDictionary from "@magda/registry-aspects/examples/data-dictionary/openapi-request-response.json";
import DistributionContractSection from "./DistributionContractSection";

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

function render(
    contract: unknown,
    dataDictionary?: unknown,
    onSelectEntity?: (entityId: string) => void
) {
    act(() => {
        root.render(
            <DistributionContractSection
                distributionContract={contract as DistributionContractAspect}
                dataDictionary={dataDictionary as DataDictionaryAspect}
                onSelectEntity={onSelectEntity}
            />
        );
    });
}

function overview(): { [term: string]: string } {
    const result: { [term: string]: string } = {};
    container
        .querySelectorAll(".distribution-contract__overview dt")
        .forEach((dt) => {
            result[dt.textContent!] = dt.nextElementSibling!.textContent!;
        });
    return result;
}

function operations() {
    return Array.from(
        container.querySelectorAll<HTMLElement>(
            ".distribution-contract__operation"
        )
    );
}

function operation(id: string) {
    const element = operations().find(
        (item) => item.getAttribute("data-operation-id") === id
    );
    if (!element) {
        throw new Error(`No operation ${id}`);
    }
    return element;
}

function parameterRow(op: HTMLElement, name: string) {
    const row = Array.from(
        op.querySelectorAll<HTMLTableRowElement>(
            "tr.distribution-contract__parameter"
        )
    ).find((item) => item.getAttribute("data-parameter-name") === name);
    if (!row) {
        throw new Error(`No parameter ${name}`);
    }
    return row;
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

describe("DistributionContractSection", () => {
    it("renders a REST/OpenAPI contract", () => {
        render(openApi);
        expect(container.querySelector("h3")?.textContent).toBe("How to use");
        expect(overview()).toMatchObject({
            Protocol: "REST",
            Resource: "Data service",
            Access: "Public query",
            Endpoint: "https://example.org/api",
            Authentication:
                "None (public) — Public endpoint; no credential required",
            Provenance: "Harvested · Unreviewed",
            "Last verified": "2026-09-14T10:05:00Z"
        });
        const links = Array.from(
            container.querySelectorAll<HTMLAnchorElement>(
                ".distribution-contract__links a"
            )
        ).map((a) => [a.textContent, a.href]);
        expect(links).toEqual([
            ["API / service documentation", "https://example.org/docs"],
            [
                "OpenAPI specification (3.1.0)",
                "https://example.org/openapi.json"
            ]
        ]);
        expect(container.textContent).toContain(
            "retrieved 2026-09-14T10:00:00Z"
        );
        // source capabilities are labelled as the source's, not Magda policy
        const capabilities = container.querySelector(
            ".distribution-contract__source-capabilities"
        )!.textContent;
        expect(capabilities).toContain("(as reported by the source)");
        expect(capabilities).toContain("Methods: GET, POST");
        expect(capabilities).toContain("Max records per request: 50");
        expect(capabilities).toContain("Bulk export available: no");

        expect(operations()).toHaveLength(3);
        expect(container.textContent).toContain("Operations (3)");
        const search = operation("search-occurrences");
        expect(search.querySelector("h5")?.textContent).toBe(
            "Search occurrence recordsquery"
        );
        expect(
            search.querySelector(".distribution-contract__signature")
                ?.textContent
        ).toBe("GET/occurrences/search");
        expect(search.textContent).toContain(
            "Search records by taxon and optional spatial or temporal filters"
        );
        expect(search.textContent).toContain(
            "Endpoint: https://example.org/api/occurrences/search"
        );
        expect(search.textContent).toContain(
            "Operation ID: search-occurrences · source ID: searchOccurrences"
        );

        const q = parameterRow(search, "q");
        expect(q.textContent).toContain("query");
        expect(q.textContent).toContain("Required");
        expect(q.textContent).toContain("Taxon or query expression");
        expect(q.textContent).toContain("Example: Eucalyptus");
        const bbox = parameterRow(search, "bbox");
        expect(bbox.textContent).toContain("minX,minY,maxX,maxY");
        expect(bbox.textContent).toContain("Optional");
        const pageSize = parameterRow(search, "pageSize");
        expect(pageSize.textContent).toContain("integer");
        expect(pageSize.textContent).toContain("Default: 10");
        expect(pageSize.textContent).toContain("Range: 1 – 50");
        const language = parameterRow(search, "Accept-Language");
        expect(language.textContent).toContain("header");
        expect(language.textContent).toContain("Allowed values: en, fr");
        // no parameter has its own provenance: no provenance column
        expect(search.querySelectorAll("th")).toHaveLength(5);

        expect(
            search.querySelector(".distribution-contract__response")
                ?.textContent
        ).toBe(
            "Response: application/json · status 200 · records at /occurrences · structure: occurrence-record"
        );
        expect(
            search.querySelector(".distribution-contract__pagination")
                ?.textContent
        ).toBe(
            "Pagination: offset-limit (page size parameter pageSize, offset parameter offset, total count at /total)"
        );
        expect(
            operation("advanced-search").querySelector(
                ".distribution-contract__request"
            )?.textContent
        ).toBe(
            "Request body: required · application/json · structure: search-request"
        );
        expect(
            operation("get-occurrence").querySelector(
                ".distribution-contract__response"
            )?.textContent
        ).toContain("records at (whole response)");
    });

    it("never composes an executable URL from the endpoint and a path", () => {
        render(openApi);
        const getOccurrence = operation("get-occurrence");
        expect(getOccurrence.textContent).toContain("/occurrences/{id}");
        expect(container.textContent).not.toContain(
            "https://example.org/api/occurrences/{id}"
        );
        expect(getOccurrence.textContent).not.toContain("Endpoint:");
    });

    it("links request/response entities into the data dictionary", () => {
        const onSelectEntity = jest.fn();
        const contract: any = JSON.parse(JSON.stringify(openApi));
        contract.operations[2].response.dictionaryEntity = "missing-entity";
        render(contract, openApiDictionary, onSelectEntity);
        const links = Array.from(
            container.querySelectorAll<HTMLButtonElement>(
                "button.distribution-contract__entity-link"
            )
        );
        expect(
            links.map((link) => [
                link.getAttribute("data-entity-id"),
                link.textContent
            ])
        ).toEqual([
            ["occurrence-record", "Occurrence (occurrence-record)"],
            ["search-request", "Search request (search-request)"],
            ["occurrence-record", "Occurrence (occurrence-record)"]
        ]);
        act(() => links[1].click());
        expect(onSelectEntity).toHaveBeenCalledWith("search-request");
        // unknown entity: plain text, flagged
        expect(
            operation("get-occurrence").querySelector(
                ".distribution-contract__response"
            )?.textContent
        ).toContain("structure: missing-entity (not described in Structure)");
    });

    it("shows entity references as text without a data dictionary", () => {
        render(openApi, undefined, jest.fn());
        expect(
            container.querySelector("button.distribution-contract__entity-link")
        ).toBeNull();
        expect(container.textContent).not.toContain(
            "not described in Structure"
        );
    });

    it("renders a simple HTTP download", () => {
        render(httpDownload);
        expect(overview()).toMatchObject({
            Protocol: "HTTP",
            Resource: "Downloadable file",
            Access: "Public download",
            Endpoint: "https://example.org/data/observations.csv",
            Authentication: "None (public)",
            Provenance: "Manual / custodian · Reviewed"
        });
        expect(container.textContent).toContain("Operation");
        expect(container.querySelector("table")).toBeNull();
        expect(container.textContent).toContain("Bulk export available: yes");
    });

    it("renders an ArcGIS Feature Service with additional source capabilities", () => {
        render(arcgis);
        expect(overview().Protocol).toBe("ArcGIS Feature Service");
        expect(overview().Access).toBe("Query only (no bulk download)");
        expect(overview()).not.toHaveProperty("Authentication");
        const query = operation("query-features");
        expect(parameterRow(query, "f").textContent).toContain(
            "Allowed values: json, geojson, pbf"
        );
        expect(parameterRow(query, "where").textContent).toContain(
            "Default: 1=1"
        );
        expect(container.textContent).toContain(
            "ArcGIS service definition (11.1)"
        );
        // undocumented capability keys are shown generically
        expect(container.textContent).toContain("supports statistics: yes");
        expect(container.textContent).toContain(
            "Output formats: json, geojson, pbf"
        );
    });

    it("renders OGC API / STAC link-relation pagination", () => {
        render(ogcStac);
        expect(
            operation("search-items").querySelector(
                ".distribution-contract__pagination"
            )?.textContent
        ).toBe(
            "Pagination: next-link (page size parameter limit, next page link relation next, total count at /numberMatched)"
        );
        expect(container.textContent).toContain("OGC API definition (1.0.0)");
    });

    it("renders descriptive authentication only", () => {
        render(authenticated);
        expect(overview().Authentication).toBe(
            "API key · sent as header X-API-Key — API key issued by the custodian on request. Send it in the X-API-Key header. How to get access"
        );
        expect(overview().Access).toBe("Query with authentication");
        const extract = operation("request-extract");
        expect(extract.textContent).toContain(
            "Authentication: OAuth 2.0 · scopes: extracts:create — Requires an OAuth 2.0 access token"
        );
        expect(extract.textContent).toContain(
            "Request body: required · application/json — Extract request: site codes and date range"
        );
        expect(container.textContent).toContain(
            "Rate limit: 60 requests per minute per API key"
        );
        expect(container.textContent).toContain(
            "Manual / custodian · Custodian-approved"
        );
        expect(
            operation("list-measurements").querySelector(
                ".distribution-contract__pagination"
            )?.textContent
        ).toBe(
            "Pagination: page (page size parameter per_page, page number parameter page, total count at /meta/total)"
        );
    });

    it("shows operation-, parameter- and property-level provenance", () => {
        render(mixedProvenance);
        const listSites = operation("list-sites");
        expect(listSites.textContent).toContain(
            "purpose: Manual / custodian · Custodian-approved"
        );
        // a parameter has its own (property) provenance: provenance column
        expect(listSites.querySelectorAll("th")).toHaveLength(6);
        expect(parameterRow(listSites, "status").textContent).toContain(
            "description: Manual / custodian · Reviewed"
        );
        // inherited (unchanged) provenance is not repeated per parameter
        expect(
            parameterRow(listSites, "cursor").querySelector(
                ".data-dictionary__provenance"
            )
        ).toBeNull();
        const summary = operation("site-summary");
        expect(
            summary.querySelector(
                ".distribution-contract__operation-meta .data-dictionary__provenance"
            )?.textContent
        ).toBe("Manual / custodian · Custodian-approved");
        const day = parameterRow(summary, "day");
        expect(day.textContent).toContain("Agent-generated · Unreviewed");
        expect(
            day.querySelector(".data-dictionary__provenance--advisory")
        ).not.toBeNull();
        expect(
            container.querySelector(".distribution-contract__overview")
                ?.textContent
        ).toContain("Harvested · Unreviewed");
    });

    it("renders a contract with no optional metadata", () => {
        // authentication without a `type` is dropped by normalization
        render(
            normalizeDistributionContract({
                schemaVersion: "1.0",
                authentication: { scopes: [] }
            })
        );
        expect(container.querySelector("h3")?.textContent).toBe("How to use");
        expect(overview()).toEqual({ Provenance: "Unknown origin" });
        expect(operations()).toHaveLength(0);
        expect(container.querySelector("h4")).toBeNull();
        expect(
            container.querySelector(
                ".distribution-contract__source-capabilities"
            )
        ).toBeNull();
    });

    it("never lists the credential input authentication describes as a parameter", () => {
        const contract: any = JSON.parse(JSON.stringify(authenticated));
        contract.operations[0].parameters.push({
            name: "X-API-Key",
            location: "header",
            type: "string",
            example: "s3cr3t"
        });
        // an empty override must not hide the contract-level API key
        contract.operations[0].authentication = {};
        render(normalizeDistributionContract(contract));
        const list = operation("list-measurements");
        expect(
            Array.from(
                list.querySelectorAll("tr.distribution-contract__parameter")
            ).map((row) => row.getAttribute("data-parameter-name"))
        ).toEqual(["siteId", "page", "per_page"]);
        expect(list.textContent).not.toContain("Authentication:");
        expect(container.textContent).not.toContain("s3cr3t");
    });

    it("only links http(s) URLs", () => {
        /* eslint-disable no-script-url */
        render(
            normalizeDistributionContract({
                schemaVersion: "1.0",
                documentationUrl: "javascript:alert(1)",
                specification: { type: "openapi", url: "javascript:alert(2)" },
                authentication: {
                    type: "oauth2",
                    documentationUrl: "javascript:alert(3)"
                }
            })
        );
        /* eslint-enable no-script-url */
        expect(container.querySelector("a")).toBeNull();
        expect(overview()).not.toHaveProperty("Documentation");
    });

    it("cannot be crashed by malformed nested metadata once normalized", () => {
        const bad = { nested: { object: true } };
        const provenance = { method: bad, reviewStatus: [bad] };
        const raw = {
            schemaVersion: "1.0",
            protocol: bad,
            endpointUrl: bad,
            specification: bad,
            authentication: { type: bad, scopes: [bad, "read"] },
            sourceCapabilities: { allowedMethods: bad, custom: bad },
            provenance,
            operations: [
                bad,
                null,
                { id: bad },
                {
                    id: "dup",
                    label: bad,
                    method: bad,
                    path: bad,
                    parameters: [
                        bad,
                        {
                            name: "q",
                            location: "query",
                            type: bad,
                            enum: [bad, "ok"],
                            default: bad,
                            minimum: bad,
                            provenance,
                            propertyProvenance: { description: bad }
                        },
                        {
                            name: "q",
                            location: "query",
                            type: "string"
                        }
                    ],
                    request: bad,
                    response: {
                        mediaTypes: bad,
                        statusCodes: [bad, 200],
                        recordsPath: bad,
                        dictionaryEntity: bad,
                        pagination: { type: bad, limitParameter: bad }
                    },
                    provenance,
                    propertyProvenance: bad
                },
                // duplicate ids render (by position) rather than crash
                { id: "dup", label: "Second" }
            ]
        };
        expect(() =>
            render(normalizeDistributionContract(raw), {
                schemaVersion: "1.0",
                entities: []
            })
        ).not.toThrow();
        expect(operations()).toHaveLength(2);
        const first = operations()[0];
        expect(first.querySelector("h5")?.textContent).toBe("dup");
        expect(
            first.querySelectorAll("tr.distribution-contract__parameter")
        ).toHaveLength(2);
        expect(first.textContent).toContain('{"nested":{"object":true}}');
        expect(first.textContent).toContain("unknown");
        expect(operations()[1].querySelector("h5")?.textContent).toBe("Second");
        expect(container.textContent).toContain(
            'custom: {"nested":{"object":true}}'
        );
    });
});

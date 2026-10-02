import "mocha";
import { expect } from "chai";
import path from "path";
import fse from "fs-extra";
import Ajv from "ajv";
import { requireResolve } from "@magda/esm-utils";
import {
    DATA_DICTIONARY_SCHEMA_VERSION,
    DataDictionaryAspect,
    FIELD_PATH_REGEX,
    escapeFieldPathSegment,
    formatFieldPath,
    getEffectiveProvenance,
    getFieldPathDepth,
    getParentFieldPath,
    isAdvisoryProvenance,
    isProtectedProvenance,
    isValidFieldPath,
    normalizeDataDictionary,
    parseFieldPath,
    validateDataDictionary
} from "../../data-dictionary/index.js";

const aspectsDir = path.dirname(
    requireResolve("@magda/registry-aspects/package.json")
);
const fixturesDir = path.resolve(aspectsDir, "examples", "data-dictionary");

function loadSchema() {
    const schema = fse.readJsonSync(
        path.resolve(aspectsDir, "data-dictionary.schema.json")
    );
    // ajv only registers the `http://` draft-07 meta-schema URI; the registry
    // (everit) accepts the `https://` form used by the built-in schema.
    delete schema["$schema"];
    return schema;
}

function loadFixture(name: string): DataDictionaryAspect {
    return fse.readJsonSync(path.resolve(fixturesDir, name));
}

const fixtureFiles = fse
    .readdirSync(fixturesDir)
    .filter((file: string) => file.endsWith(".json"))
    .sort();

// The documented v1 compatibility matrix (docs/design/data-dictionary-design.md)
const compatibilityMatrix = [
    "csv-table.json",
    "excel-multi-sheet.json",
    "openapi-request-response.json",
    "arcgis-feature-layer.json",
    "relational-composite-keys.json",
    "parquet-nested.json",
    "netcdf-dimensions.json",
    "manual-override-mixed-provenance.json",
    "reserved-character-paths.json"
];

describe("data-dictionary aspect", () => {
    const ajv = new Ajv({ allErrors: true });
    const validate = ajv.compile(loadSchema());

    const isValid = (data: unknown) => {
        const result = validate(data) as boolean;
        return { result, errors: validate.errors };
    };

    describe("JSON schema", () => {
        it("should cover every fixture of the v1 compatibility matrix", () => {
            compatibilityMatrix.forEach((file) =>
                expect(fixtureFiles).to.include(file)
            );
        });

        fixtureFiles.forEach((file: string) => {
            it(`should accept fixture ${file}`, () => {
                const { result, errors } = isValid(loadFixture(file));
                expect(errors).to.be.null;
                expect(result).to.equal(true);
            });

            it(`fixture ${file} should have no cross-reference issues`, () => {
                expect(validateDataDictionary(loadFixture(file))).to.deep.equal(
                    []
                );
            });
        });

        it("should accept a minimal dictionary with no entities", () => {
            expect(isValid({ schemaVersion: "1.0", entities: [] }).result).to.be
                .true;
        });

        it("should accept unknown additive properties", () => {
            const data: any = loadFixture("csv-table.json");
            data.futureTopLevel = { a: 1 };
            data.entities[0].futureEntityProp = true;
            data.entities[0].fields[0].futureFieldProp = "x";
            data.provenance.method = "some-future-method";
            data.entities[0].fields[0].type = "some-future-type";
            expect(isValid(data).result).to.be.true;
        });

        const invalidCases: Array<[string, (data: any) => void]> = [
            ["missing schemaVersion", (d) => delete d.schemaVersion],
            [
                "unsupported major schemaVersion",
                (d) => (d.schemaVersion = "2.0")
            ],
            ["missing entities", (d) => delete d.entities],
            ["entities not an array", (d) => (d.entities = {})],
            ["entity without id", (d) => delete d.entities[0].id],
            ["entity with empty id", (d) => (d.entities[0].id = "")],
            ["entity without name", (d) => delete d.entities[0].name],
            ["entity without fields", (d) => delete d.entities[0].fields],
            ["field without path", (d) => delete d.entities[0].fields[0].path],
            ["field without name", (d) => delete d.entities[0].fields[0].name],
            ["field without type", (d) => delete d.entities[0].fields[0].type],
            ["empty field path", (d) => (d.entities[0].fields[0].path = "")],
            [
                "unescaped `[` in path",
                (d) => (d.entities[0].fields[0].path = "a[b")
            ],
            [
                "empty path segment",
                (d) => (d.entities[0].fields[0].path = "a..b")
            ],
            [
                "trailing dot in path",
                (d) => (d.entities[0].fields[0].path = "a.")
            ],
            [
                "escape of a non-reserved character",
                (d) => (d.entities[0].fields[0].path = "a\\b")
            ],
            [
                "trailing backslash",
                (d) => (d.entities[0].fields[0].path = "a\\")
            ],
            ["empty primaryKey", (d) => (d.entities[0].primaryKey = [])],
            [
                "invalid primaryKey path",
                (d) => (d.entities[0].primaryKey = ["a]"])
            ],
            ["relationship without id", (d) => delete d.relationships[0].id],
            [
                "relationship without target",
                (d) => delete d.relationships[0].target
            ],
            [
                "relationship endpoint without entity",
                (d) => delete d.relationships[0].source.entity
            ],
            [
                "relationship endpoint with no fields",
                (d) => (d.relationships[0].source.fields = [])
            ],
            [
                "codelist value without value",
                (d) =>
                    (d.entities[0].fields[0].valueDomain = {
                        type: "codelist",
                        values: [{ label: "x" }]
                    })
            ],
            [
                "dimension without id",
                (d) => (d.entities[0].dimensions = [{ name: "time" }])
            ],
            [
                "propertyProvenance that is not an object",
                (d) =>
                    (d.entities[0].fields[0].propertyProvenance = {
                        description: "manual"
                    })
            ],
            [
                "negative sample row count",
                (d) => (d.provenance = { sample: { rows: -1 } })
            ]
        ];

        invalidCases.forEach(([title, mutate]) => {
            it(`should reject ${title}`, () => {
                const data: any = loadFixture("excel-multi-sheet.json");
                mutate(data);
                expect(isValid(data).result).to.be.false;
            });
        });
    });

    describe("field paths", () => {
        it("should accept documented examples", () => {
            [
                "scientificName",
                "occurrences[].scientificName",
                "properties.location.latitude",
                "items[].measurements[].value",
                "a\\.b",
                "items[].a\\.b",
                "field\\[\\]",
                "back\\\\slash",
                "matrix[][]",
                "Site Name"
            ].forEach((p) => {
                expect(isValidFieldPath(p), p).to.be.true;
            });
        });

        it("should reject malformed paths", () => {
            ["", ".a", "a.", "a..b", "[]", "a[", "a]", "a[x]", "a\\b", "a\\"]
                .concat([undefined as any, 1 as any])
                .forEach((p) => {
                    expect(isValidFieldPath(p), String(p)).to.be.false;
                });
        });

        it("should keep FIELD_PATH_REGEX in sync with the JSON schema", () => {
            const schema = loadSchema();
            expect(schema.definitions.fieldPath.pattern).to.equal(
                FIELD_PATH_REGEX.source
            );
        });

        it("should parse escaped and nested paths", () => {
            expect(parseFieldPath("items[].a\\.b")).to.deep.equal([
                { name: "items", arrayDepth: 1 },
                { name: "a.b", arrayDepth: 0 }
            ]);
            expect(parseFieldPath("matrix[][]")).to.deep.equal([
                { name: "matrix", arrayDepth: 2 }
            ]);
            expect(parseFieldPath("back\\\\slash.field\\[\\]")).to.deep.equal([
                { name: "back\\slash", arrayDepth: 0 },
                { name: "field[]", arrayDepth: 0 }
            ]);
            expect(() => parseFieldPath("a..b")).to.throw();
        });

        it("should round-trip literal names through escape/format/parse", () => {
            const names = ["a.b", "field[]", "x\\y", "[weird].name]", "plain"];
            names.forEach((name) => {
                const p = formatFieldPath([name]);
                expect(isValidFieldPath(p), p).to.be.true;
                expect(parseFieldPath(p)).to.deep.equal([
                    { name, arrayDepth: 0 }
                ]);
            });
            expect(escapeFieldPathSegment("a.b[c]\\")).to.equal(
                "a\\.b\\[c\\]\\\\"
            );
            expect(
                formatFieldPath([
                    { name: "items", arrayDepth: 1 },
                    { name: "a.b", arrayDepth: 0 }
                ])
            ).to.equal("items[].a\\.b");
            expect(() => formatFieldPath([])).to.throw();
            expect(() => formatFieldPath([""])).to.throw();
        });

        it("should compute parent paths and depth", () => {
            expect(getParentFieldPath("items[].measurements[].value")).to.equal(
                "items[].measurements[]"
            );
            expect(getParentFieldPath("a\\.b")).to.be.undefined;
            expect(getFieldPathDepth("a\\.b")).to.equal(0);
            expect(getFieldPathDepth("location.latitude")).to.equal(1);
        });
    });

    describe("provenance", () => {
        const dictionary = loadFixture("manual-override-mixed-provenance.json");
        const entity = dictionary.entities[0];
        const [commodity, year, notes] = entity.fields;

        it("should inherit dictionary-level provenance", () => {
            expect(
                getEffectiveProvenance(dictionary, [entity, commodity])
            ).to.equal(dictionary.provenance);
            expect(
                getEffectiveProvenance(dictionary, [entity, commodity], "type")
            ).to.equal(dictionary.provenance);
        });

        it("should apply property-level overrides", () => {
            const p = getEffectiveProvenance(
                dictionary,
                [entity, commodity],
                "description"
            );
            expect(p?.method).to.equal("manual");
            expect(p?.reviewStatus).to.equal("custodian-approved");
            expect(
                getEffectiveProvenance(dictionary, [entity], "description")
                    ?.method
            ).to.equal("manual");
        });

        it("should apply node-level overrides (nearest wins)", () => {
            expect(
                getEffectiveProvenance(dictionary, [entity, notes])?.method
            ).to.equal("manual");
            expect(
                getEffectiveProvenance(dictionary, [entity, notes], "type")
                    ?.method
            ).to.equal("manual");
        });

        it("should return undefined when nothing is recorded", () => {
            expect(getEffectiveProvenance(undefined, [])).to.be.undefined;
            expect(getEffectiveProvenance({}, [{ provenance: undefined }])).to
                .be.undefined;
        });

        it("should identify protected (human) metadata", () => {
            const yearDescription = getEffectiveProvenance(
                dictionary,
                [entity, year],
                "description"
            );
            expect(isProtectedProvenance(yearDescription)).to.be.false;
            expect(
                isProtectedProvenance(
                    getEffectiveProvenance(
                        dictionary,
                        [entity, commodity],
                        "semanticConcept"
                    )
                )
            ).to.be.true;
            expect(
                isProtectedProvenance(
                    getEffectiveProvenance(
                        dictionary,
                        [entity, commodity],
                        "type"
                    )
                )
            ).to.be.false;
            expect(
                isProtectedProvenance({
                    method: "agent-generated",
                    reviewStatus: "reviewed"
                })
            ).to.be.true;
            expect(
                isProtectedProvenance({
                    method: "manual",
                    reviewStatus: "rejected"
                })
            ).to.be.false;
            expect(isProtectedProvenance(undefined)).to.be.false;
        });

        it("should identify advisory metadata", () => {
            expect(isAdvisoryProvenance({ method: "inferred" })).to.be.true;
            expect(isAdvisoryProvenance({ method: "agent-generated" })).to.be
                .true;
            expect(
                isAdvisoryProvenance({
                    method: "agent-generated",
                    reviewStatus: "custodian-approved"
                })
            ).to.be.false;
            expect(isAdvisoryProvenance({ method: "authoritative-import" })).to
                .be.false;
            expect(isAdvisoryProvenance({ method: "manual" })).to.be.false;
            expect(isAdvisoryProvenance(undefined)).to.be.true;
        });
    });

    describe("validateDataDictionary()", () => {
        const codes = (data: unknown) =>
            validateDataDictionary(data).map((issue) => issue.code);

        it("should report non-object / missing core structure", () => {
            expect(codes(null)).to.deep.equal(["invalid-aspect"]);
            expect(codes({})).to.deep.equal([
                "missing-schema-version",
                "missing-entities"
            ]);
            expect(
                codes({ schemaVersion: "2.0", entities: [] })
            ).to.deep.equal(["unsupported-schema-version"]);
        });

        it("should report duplicate identities", () => {
            const data: any = loadFixture("excel-multi-sheet.json");
            data.entities[1].id = "observations";
            data.entities[0].fields[1].path = "observation_id";
            data.relationships.push({ ...data.relationships[0] });
            const result = codes(data);
            expect(result).to.include("duplicate-entity-id");
            expect(result).to.include("duplicate-field-path");
            expect(result).to.include("duplicate-relationship-id");
        });

        it("should report invalid field paths with a JSON pointer", () => {
            const data: any = loadFixture("csv-table.json");
            data.entities[0].fields[2].path = "a..b";
            expect(validateDataDictionary(data)).to.deep.include({
                severity: "error",
                code: "invalid-field-path",
                message: "Invalid normalized field path `a..b`",
                location: "/entities/0/fields/2/path"
            });
        });

        it("should report dangling key, dimension and relationship references", () => {
            const excel: any = loadFixture("excel-multi-sheet.json");
            excel.entities[0].primaryKey = ["missing"];
            excel.relationships[0].target.entity = "unknown";
            excel.relationships[0].source.fields = ["site_id", "value"];
            const excelCodes = codes(excel);
            expect(excelCodes).to.include("unknown-primary-key-field");
            expect(excelCodes).to.include("unknown-relationship-entity");
            expect(excelCodes).to.include("relationship-field-count-mismatch");

            const composite: any = loadFixture(
                "relational-composite-keys.json"
            );
            composite.relationships[0].target.fields = ["site_code", "nope"];
            expect(codes(composite)).to.deep.equal([
                "unknown-relationship-field"
            ]);

            const netcdf: any = loadFixture("netcdf-dimensions.json");
            netcdf.entities[0].fields[3].dimensions = ["time", "depth"];
            netcdf.entities[0].dimensions.push({ id: "time" });
            const netcdfCodes = codes(netcdf);
            expect(netcdfCodes).to.include("unknown-dimension");
            expect(netcdfCodes).to.include("duplicate-dimension-id");
        });

        it("should warn about unknown geometry/dimension field paths", () => {
            const arcgis: any = loadFixture("arcgis-feature-layer.json");
            arcgis.entities[0].geometry.fieldPath = "shape";
            expect(validateDataDictionary(arcgis)).to.deep.equal([
                {
                    severity: "warning",
                    code: "unknown-geometry-field",
                    message:
                        "Geometry field path `shape` is not a field of entity `layer-0`",
                    location: "/entities/0/geometry/fieldPath"
                }
            ]);
        });
    });

    describe("normalizeDataDictionary()", () => {
        it("should return undefined for unusable data", () => {
            expect(normalizeDataDictionary(undefined)).to.be.undefined;
            expect(normalizeDataDictionary("x")).to.be.undefined;
            expect(normalizeDataDictionary({ schemaVersion: "1.0" })).to.be
                .undefined;
        });

        it("should keep valid dictionaries intact", () => {
            const data = loadFixture("netcdf-dimensions.json");
            const normalized = normalizeDataDictionary(data);
            expect(
                normalized.entities[0].fields.map((f) => f.path)
            ).to.deep.equal(data.entities[0].fields.map((f) => f.path));
            expect(normalized.entities[0].dimensions).to.deep.equal(
                data.entities[0].dimensions
            );
            expect(normalized.source).to.deep.equal(data.source);
        });

        it("should defensively repair malformed data for display", () => {
            const normalized = normalizeDataDictionary({
                entities: [
                    null,
                    {
                        fields: [
                            { name: "a" },
                            { path: "b", type: "integer", roles: "x" },
                            "junk",
                            {}
                        ],
                        primaryKey: "a"
                    }
                ],
                relationships: [{ id: "x" }]
            });
            expect(normalized.schemaVersion).to.equal(
                DATA_DICTIONARY_SCHEMA_VERSION
            );
            expect(normalized.entities).to.have.length(1);
            const entity = normalized.entities[0];
            expect(entity.id).to.equal("entity-1");
            expect(entity.name).to.equal("entity-1");
            expect(entity.primaryKey).to.be.undefined;
            expect(entity.fields).to.have.length(2);
            expect(entity.fields[0]).to.include({
                path: "a",
                name: "a",
                type: "unknown"
            });
            expect(entity.fields[1]).to.include({
                path: "b",
                name: "b",
                type: "integer"
            });
            expect(entity.fields[1].roles).to.be.undefined;
            expect(normalized.relationships).to.deep.equal([]);
        });
    });
});

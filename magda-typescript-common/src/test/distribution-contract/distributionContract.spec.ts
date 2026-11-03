import "mocha";
import { expect } from "chai";
import path from "path";
import fse from "fs-extra";
import Ajv from "ajv";
import { requireResolve } from "@magda/esm-utils";
import {
    DISTRIBUTION_CONTRACT_SCHEMA_VERSION,
    DistributionContractAspect,
    JSON_POINTER_REGEX,
    getEffectiveAuthentication,
    getEffectiveProvenance,
    getParameterIdentity,
    hasProvenanceStatement,
    isAdvisoryProvenance,
    isAuthenticationParameter,
    isCredentialLikeParameterName,
    isProtectedProvenance,
    isSupportedSchemaVersion,
    isValidJsonPointer,
    normalizeDistributionContract,
    validateDistributionContract
} from "../../distribution-contract/index.js";
import * as dataDictionaryProvenance from "../../data-dictionary/provenance.js";
import { normalizeDataDictionary } from "../../data-dictionary/normalize.js";

const aspectsDir = path.dirname(
    requireResolve("@magda/registry-aspects/package.json")
);
const fixturesDir = path.resolve(
    aspectsDir,
    "examples",
    "distribution-contract"
);
const dictionaryFixturesDir = path.resolve(
    aspectsDir,
    "examples",
    "data-dictionary"
);

function loadSchema() {
    const schema = fse.readJsonSync(
        path.resolve(aspectsDir, "distribution-contract.schema.json")
    );
    // ajv only registers the `http://` draft-07 meta-schema URI; the registry
    // (everit) accepts the `https://` form used by the built-in schema.
    delete schema["$schema"];
    return schema;
}

function loadFixture(name: string): DistributionContractAspect {
    return fse.readJsonSync(path.resolve(fixturesDir, name));
}

function loadDictionary(name: string) {
    return fse.readJsonSync(path.resolve(dictionaryFixturesDir, name));
}

const fixtureFiles = fse
    .readdirSync(fixturesDir)
    .filter((file: string) => file.endsWith(".json"))
    .sort();

// The documented v1 compatibility fixtures
// (docs/design/distribution-contract-design.md). The 7th case, a distribution
// without the aspect, is covered by the web client tests.
const compatibilityMatrix = [
    "http-download.json",
    "openapi-rest-query.json",
    "arcgis-feature-service.json",
    "ogc-stac-query.json",
    "authenticated-restricted.json",
    "mixed-provenance.json"
];

// Fixtures whose `dictionaryEntity` references resolve against a published
// data-dictionary fixture of the same source family.
const dictionaryPairs: Array<[string, string]> = [
    ["http-download.json", "csv-table.json"],
    ["openapi-rest-query.json", "openapi-request-response.json"],
    ["arcgis-feature-service.json", "arcgis-feature-layer.json"]
];

describe("distribution-contract aspect", () => {
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
                expect(
                    validateDistributionContract(loadFixture(file))
                ).to.deep.equal([]);
            });
        });

        dictionaryPairs.forEach(([contractFile, dictionaryFile]) => {
            it(`fixture ${contractFile} should resolve its entities in ${dictionaryFile}`, () => {
                expect(
                    validateDistributionContract(
                        loadFixture(contractFile),
                        loadDictionary(dictionaryFile)
                    )
                ).to.deep.equal([]);
            });
        });

        it("should accept a minimal contract", () => {
            expect(isValid({ schemaVersion: "1.0" }).result).to.be.true;
            expect(isValid({ schemaVersion: "1.0", operations: [] }).result).to
                .be.true;
        });

        it("should accept unknown additive properties and vocabulary values", () => {
            const data: any = loadFixture("openapi-rest-query.json");
            data.futureTopLevel = { a: 1 };
            data.protocol = "Some Future Protocol";
            data.operations[0].futureOperationProp = true;
            data.operations[0].interactionType = "subscribe";
            data.operations[0].parameters[0].futureParamProp = "x";
            data.operations[0].parameters[0].location = "matrix";
            data.operations[0].response.pagination.type = "token";
            data.sourceCapabilities.supportsStatistics = true;
            data.provenance.method = "some-future-method";
            expect(isValid(data).result).to.be.true;
        });

        it("should accept any JSON value in default/example/enum", () => {
            const data: any = loadFixture("openapi-rest-query.json");
            Object.assign(data.operations[0].parameters[0], {
                enum: [null, { code: "A" }, [1, 2], "x"],
                default: null,
                example: { lat: -35.3, lon: 149.1 }
            });
            expect(isValid(data).result).to.be.true;
        });

        it("should accept non-secret header and cookie parameters", () => {
            const data: any = loadFixture("openapi-rest-query.json");
            data.operations[0].parameters.push(
                { name: "X-Request-Id", location: "header", type: "string" },
                { name: "locale", location: "cookie", type: "string" }
            );
            expect(isValid(data).result).to.be.true;
        });

        const invalidCases: Array<[string, (data: any) => void]> = [
            ["missing schemaVersion", (d) => delete d.schemaVersion],
            [
                "unsupported major schemaVersion",
                (d) => (d.schemaVersion = "2.0")
            ],
            ["operations not an array", (d) => (d.operations = {})],
            ["operation without id", (d) => delete d.operations[0].id],
            ["operation with empty id", (d) => (d.operations[0].id = "")],
            [
                "parameter without name",
                (d) => delete d.operations[0].parameters[0].name
            ],
            [
                "parameter without location",
                (d) => delete d.operations[0].parameters[0].location
            ],
            [
                "parameter without type",
                (d) => delete d.operations[0].parameters[0].type
            ],
            [
                "parameter with empty name",
                (d) => (d.operations[0].parameters[0].name = "")
            ],
            [
                "parameter with empty location",
                (d) => (d.operations[0].parameters[0].location = "")
            ],
            [
                "parameter with empty type",
                (d) => (d.operations[0].parameters[0].type = "")
            ],
            [
                "Authorization header parameter",
                (d) =>
                    d.operations[0].parameters.push({
                        name: "Authorization",
                        location: "header",
                        type: "string"
                    })
            ],
            [
                "authorization header parameter (any case)",
                (d) =>
                    d.operations[0].parameters.push({
                        name: "proxy-AUTHORIZATION",
                        location: "header",
                        type: "string"
                    })
            ],
            [
                "empty dictionaryEntity",
                (d) => (d.operations[0].response.dictionaryEntity = "")
            ],
            [
                "empty request dictionaryEntity",
                (d) => (d.operations[1].request.dictionaryEntity = "")
            ],
            [
                "recordsPath that is not a JSON Pointer",
                (d) => (d.operations[0].response.recordsPath = "occurrences")
            ],
            [
                "recordsPath in JSONPath syntax",
                (d) => (d.operations[0].response.recordsPath = "$.occurrences")
            ],
            [
                "pagination path with an invalid escape",
                (d) => (d.operations[0].response.pagination.totalPath = "/a~2b")
            ],
            [
                "empty pagination parameter reference",
                (d) => (d.operations[0].response.pagination.limitParameter = "")
            ],
            [
                "non-integer status code",
                (d) => (d.operations[0].response.statusCodes = [200.5])
            ],
            [
                "non-string media type",
                (d) => (d.operations[0].response.mediaTypes = [1])
            ],
            [
                "negative maximumRecordsPerRequest",
                (d) => (d.sourceCapabilities.maximumRecordsPerRequest = -1)
            ],
            [
                "non-boolean capability flag",
                (d) => (d.sourceCapabilities.bulkExportAvailable = "no")
            ],
            [
                "non-boolean interactiveExampleCandidate",
                (d) => (d.operations[0].interactiveExampleCandidate = "yes")
            ],
            [
                "non-string authentication scopes",
                (d) => (d.authentication.scopes = [{}])
            ],
            [
                "authentication without type",
                (d) => delete d.authentication.type
            ],
            ["empty authentication type", (d) => (d.authentication.type = "")],
            [
                "empty operation-level authentication",
                (d) => (d.operations[0].authentication = {})
            ],
            [
                "operation-level authentication stating only details",
                (d) =>
                    (d.operations[0].authentication = {
                        description: "Needs a key"
                    })
            ],
            [
                "empty authentication credential name",
                (d) =>
                    Object.assign(d.authentication, {
                        type: "api-key",
                        location: "header",
                        name: ""
                    })
            ],
            [
                "empty authentication credential location",
                (d) =>
                    Object.assign(d.authentication, {
                        type: "api-key",
                        location: "",
                        name: "X-API-Key"
                    })
            ],
            [
                "empty operation sourceIdentifier",
                (d) => (d.operations[0].sourceIdentifier = "")
            ],
            [
                "empty parameter sourceIdentifier",
                (d) => (d.operations[0].parameters[0].sourceIdentifier = "")
            ],
            ["empty contract provenance", (d) => (d.provenance = {})],
            [
                "provenance with an empty method",
                (d) => (d.provenance = { method: "" })
            ],
            [
                "provenance with an empty reviewStatus",
                (d) => (d.provenance = { reviewStatus: "" })
            ],
            [
                "operation provenance stating neither method nor reviewStatus",
                (d) => (d.operations[0].provenance = { generator: "x" })
            ],
            [
                "empty parameter provenance",
                (d) => (d.operations[0].parameters[0].provenance = {})
            ],
            [
                "empty property-level provenance",
                (d) =>
                    (d.operations[0].propertyProvenance = {
                        purpose: {}
                    })
            ],
            [
                "propertyProvenance that is not an object",
                (d) =>
                    (d.operations[0].parameters[0].propertyProvenance = {
                        description: "manual"
                    })
            ]
        ];

        invalidCases.forEach(([title, mutate]) => {
            it(`should reject ${title}`, () => {
                const data: any = loadFixture("openapi-rest-query.json");
                mutate(data);
                expect(isValid(data).result).to.be.false;
            });
        });
    });

    describe("JSON pointers", () => {
        it("should accept RFC 6901 pointers", () => {
            ["", "/", "/occurrences", "/paging/nextCursor", "/a~0b/c~1d/0"]
                .map((pointer) => [pointer, isValidJsonPointer(pointer)])
                .forEach(
                    ([pointer, valid]) =>
                        expect(valid, String(pointer)).to.be.true
                );
        });

        it("should reject malformed pointers", () => {
            [
                "occurrences",
                "$.occurrences",
                "/a~",
                "/a~2",
                "#/a",
                undefined,
                1
            ].forEach(
                (pointer) =>
                    expect(isValidJsonPointer(pointer), String(pointer)).to.be
                        .false
            );
        });

        it("should keep JSON_POINTER_REGEX in sync with the JSON schema", () => {
            const schema = loadSchema();
            expect(
                new RegExp(schema.definitions.jsonPointer.pattern).source
            ).to.equal(JSON_POINTER_REGEX.source);
        });
    });

    describe("provenance", () => {
        const contract = loadFixture("mixed-provenance.json");
        const [listSites, siteSummary] = contract.operations;
        const [status, cursor] = listSites.parameters;
        const [code, day] = siteSummary.parameters;

        it("should inherit contract-level provenance", () => {
            expect(
                getEffectiveProvenance(contract, [listSites, cursor])
            ).to.equal(contract.provenance);
            expect(
                getEffectiveProvenance(contract, [listSites], "method")
            ).to.equal(contract.provenance);
        });

        it("should apply property-level overrides", () => {
            const purpose = getEffectiveProvenance(
                contract,
                [listSites],
                "purpose"
            );
            expect(purpose?.method).to.equal("manual");
            expect(isProtectedProvenance(purpose)).to.be.true;
            // source-derived structure of the same operation stays refreshable
            expect(
                isProtectedProvenance(
                    getEffectiveProvenance(contract, [listSites], "path")
                )
            ).to.be.false;
            expect(
                getEffectiveProvenance(
                    contract,
                    [listSites, status],
                    "description"
                )?.reviewStatus
            ).to.equal("reviewed");
            expect(
                isProtectedProvenance(
                    getEffectiveProvenance(
                        contract,
                        [listSites, status],
                        "type"
                    )
                )
            ).to.be.false;
        });

        it("should apply operation- and parameter-level overrides (nearest wins)", () => {
            expect(
                getEffectiveProvenance(contract, [siteSummary, code])
            ).to.equal(siteSummary.provenance);
            expect(
                getEffectiveProvenance(contract, [siteSummary, day])?.method
            ).to.equal("agent-generated");
            expect(
                isAdvisoryProvenance(
                    getEffectiveProvenance(contract, [siteSummary, day])
                )
            ).to.be.true;
        });

        it("should not let provenance without method/reviewStatus mask inherited provenance", () => {
            const human = {
                provenance: {
                    method: "manual",
                    reviewStatus: "custodian-approved"
                }
            };
            const parameter = {
                provenance: {},
                propertyProvenance: { description: { generator: "x" } }
            };
            [
                getEffectiveProvenance(human, [{ provenance: {} }, parameter]),
                getEffectiveProvenance(human, [parameter], "description"),
                getEffectiveProvenance(human, [
                    { provenance: { generator: "x", note: "n" } }
                ])
            ].forEach((p) => {
                expect(p).to.equal(human.provenance);
                expect(isProtectedProvenance(p)).to.be.true;
            });
            expect(hasProvenanceStatement({})).to.be.false;
            expect(hasProvenanceStatement({ method: "" })).to.be.false;
            expect(hasProvenanceStatement({ reviewStatus: "reviewed" })).to.be
                .true;
        });

        it("should share protection semantics with data-dictionary", () => {
            const samples = [
                undefined,
                { method: "manual" },
                { method: "manual", reviewStatus: "rejected" },
                { method: "agent-generated", reviewStatus: "reviewed" },
                { method: "harvested" },
                { method: "inferred" },
                { method: "some-future-method" }
            ];
            samples.forEach((p) => {
                expect(isProtectedProvenance(p)).to.equal(
                    dataDictionaryProvenance.isProtectedProvenance(p)
                );
                expect(isAdvisoryProvenance(p)).to.equal(
                    dataDictionaryProvenance.isAdvisoryProvenance(p)
                );
            });
            expect(isProtectedProvenance({ method: "manual" })).to.be.true;
            expect(isAdvisoryProvenance({ method: "harvested" })).to.be.false;
        });
    });

    describe("identity and authentication helpers", () => {
        it("should identify parameters by sourceIdentifier, else location + name", () => {
            expect(
                getParameterIdentity({
                    name: "q",
                    location: "query",
                    sourceIdentifier: "query-q"
                })
            ).to.equal("sourceIdentifier:query-q");
            expect(
                getParameterIdentity({ name: "q", location: "query" })
            ).to.equal("location:query:q");
            // header names are case-insensitive
            expect(
                getParameterIdentity({ name: "X-Trace", location: "header" })
            ).to.equal(
                getParameterIdentity({ name: "x-trace", location: "header" })
            );
            expect(
                getParameterIdentity({ name: "Q", location: "query" })
            ).to.not.equal(
                getParameterIdentity({ name: "q", location: "query" })
            );
        });

        it("should resolve operation-level authentication overrides", () => {
            const contract = loadFixture("authenticated-restricted.json");
            const [list, extract] = contract.operations;
            expect(getEffectiveAuthentication(contract, list)).to.equal(
                contract.authentication
            );
            expect(
                getEffectiveAuthentication(contract, extract)?.type
            ).to.equal("oauth2");
            expect(getEffectiveAuthentication(undefined, undefined)).to.be
                .undefined;
        });

        it("should not let authentication without a type mask inherited authentication", () => {
            const contract = loadFixture("authenticated-restricted.json");
            [{}, { description: "x" }, { type: "" }, "api-key", null].forEach(
                (authentication: any) =>
                    expect(
                        getEffectiveAuthentication(contract, {
                            authentication
                        }),
                        JSON.stringify(authentication)
                    ).to.equal(contract.authentication)
            );
            expect(
                getEffectiveAuthentication(
                    { authentication: {} as any },
                    { authentication: undefined }
                )
            ).to.be.undefined;
            expect(
                getEffectiveAuthentication(contract, {
                    authentication: { type: "none" }
                })
            ).to.deep.equal({ type: "none" });
        });

        it("should recognise the credential input an authentication describes", () => {
            const auth = {
                type: "api-key",
                location: "header",
                name: "X-API-Key"
            };
            expect(
                isAuthenticationParameter(
                    { name: "x-api-key", location: "header" },
                    auth
                )
            ).to.be.true;
            expect(
                isAuthenticationParameter(
                    { name: "X-API-Key", location: "query" },
                    auth
                )
            ).to.be.false;
            expect(
                isAuthenticationParameter(
                    { name: "X-API-Key", location: "header" },
                    { type: "none" }
                )
            ).to.be.false;
        });

        it("should flag credential-like parameter names", () => {
            [
                "api_key",
                "apiKey",
                "X-API-Key",
                "access_token",
                "client_secret",
                "password",
                "key",
                "token",
                "Authorization",
                "x-auth-token"
            ].forEach(
                (name) =>
                    expect(isCredentialLikeParameterName(name), name).to.be.true
            );
            [
                "q",
                "pageToken",
                "page_token",
                "next_token",
                "author",
                "keyword",
                "monkey",
                "Accept-Language"
            ].forEach(
                (name) =>
                    expect(isCredentialLikeParameterName(name), name).to.be
                        .false
            );
        });
    });

    describe("validateDistributionContract()", () => {
        const codes = (data: unknown, dictionary?: unknown) =>
            validateDistributionContract(data, dictionary).map(
                (issue) => issue.code
            );

        it("should report non-object / missing core structure", () => {
            expect(codes(null)).to.deep.equal(["invalid-aspect"]);
            expect(codes({})).to.deep.equal(["missing-schema-version"]);
            expect(codes({ schemaVersion: "2.0" })).to.deep.equal([
                "unsupported-schema-version"
            ]);
            expect(
                codes({ schemaVersion: "1.0", operations: {} })
            ).to.deep.equal(["invalid-operations"]);
            expect(
                codes({
                    schemaVersion: "1.0",
                    operations: [null, { id: "" }, { id: "a", parameters: 1 }]
                })
            ).to.deep.equal([
                "invalid-operation",
                "missing-operation-id",
                "invalid-parameters"
            ]);
        });

        it("should report duplicate operation identities", () => {
            const data: any = loadFixture("openapi-rest-query.json");
            data.operations[1].id = "search-occurrences";
            data.operations[2].sourceIdentifier = "searchOccurrences";
            expect(validateDistributionContract(data)).to.deep.equal([
                {
                    severity: "error",
                    code: "duplicate-operation-id",
                    message: "Duplicate operation id `search-occurrences`",
                    location: "/operations/1/id"
                },
                {
                    severity: "error",
                    code: "duplicate-operation-source-identifier",
                    message:
                        "Duplicate operation sourceIdentifier `searchOccurrences`",
                    location: "/operations/2/sourceIdentifier"
                }
            ]);
        });

        it("should report duplicate parameter identities", () => {
            const data: any = loadFixture("openapi-rest-query.json");
            const params = data.operations[0].parameters;
            // same location + name
            params.push({ name: "q", location: "query", type: "string" });
            // header names are case-insensitive
            params.push({
                name: "accept-language",
                location: "header",
                type: "string"
            });
            // same sourceIdentifier
            params.push({
                name: "box",
                location: "query",
                type: "string",
                sourceIdentifier: "bbox"
            });
            // the same name in another location is a different parameter
            params.push({ name: "q", location: "header", type: "string" });
            expect(codes(data)).to.deep.equal([
                "duplicate-parameter",
                "duplicate-parameter",
                "duplicate-parameter-source-identifier"
            ]);
        });

        it("should report parameters without a name or location", () => {
            expect(
                validateDistributionContract({
                    schemaVersion: "1.0",
                    operations: [
                        {
                            id: "a",
                            parameters: [
                                "x",
                                { location: "query", type: "string" },
                                { name: "b", type: "string" }
                            ]
                        }
                    ]
                }).map((issue) => [issue.code, issue.location])
            ).to.deep.equal([
                ["invalid-parameter", "/operations/0/parameters/0"],
                ["missing-parameter-name", "/operations/0/parameters/1/name"],
                [
                    "missing-parameter-location",
                    "/operations/0/parameters/2/location"
                ]
            ]);
        });

        it("should not let an empty operation authentication hide the credential input", () => {
            expect(
                validateDistributionContract({
                    schemaVersion: "1.0",
                    authentication: {
                        type: "api-key",
                        location: "header",
                        name: "X-API-Key"
                    },
                    operations: [
                        {
                            id: "query",
                            authentication: {},
                            parameters: [
                                {
                                    name: "X-API-Key",
                                    location: "header",
                                    type: "string"
                                }
                            ]
                        }
                    ]
                }).map((issue) => [issue.code, issue.location])
            ).to.deep.equal([
                ["credential-parameter", "/operations/0/parameters/0"]
            ]);
        });

        it("should reject credential-bearing parameters", () => {
            const data: any = loadFixture("authenticated-restricted.json");
            data.operations[0].parameters.push(
                { name: "authorization", location: "header", type: "string" },
                // the input `authentication` describes
                { name: "x-api-key", location: "header", type: "string" },
                // only a warning: a heuristic
                { name: "access_token", location: "query", type: "string" }
            );
            // the extract operation overrides authentication (OAuth), so an
            // X-API-Key header there is not the described input
            data.operations[1].parameters = [
                { name: "X-API-Key", location: "header", type: "string" }
            ];
            expect(
                validateDistributionContract(data).map((issue) => [
                    issue.severity,
                    issue.code,
                    issue.location
                ])
            ).to.deep.equal([
                ["error", "credential-parameter", "/operations/0/parameters/3"],
                ["error", "credential-parameter", "/operations/0/parameters/4"],
                [
                    "warning",
                    "possible-credential-parameter",
                    "/operations/0/parameters/5/name"
                ],
                [
                    "warning",
                    "possible-credential-parameter",
                    "/operations/1/parameters/0/name"
                ]
            ]);
        });

        it("should check dictionary entity references only when a dictionary is supplied", () => {
            const contract: any = loadFixture("openapi-rest-query.json");
            const dictionary = loadDictionary("openapi-request-response.json");
            expect(codes(contract)).to.deep.equal([]);
            expect(codes(contract, dictionary)).to.deep.equal([]);
            // references to another distribution's dictionary don't resolve
            expect(
                validateDistributionContract(
                    contract,
                    loadDictionary("csv-table.json")
                ).map((issue) => issue.location)
            ).to.deep.equal([
                "/operations/0/response/dictionaryEntity",
                "/operations/1/request/dictionaryEntity",
                "/operations/1/response/dictionaryEntity",
                "/operations/2/response/dictionaryEntity"
            ]);
            contract.operations[1].request.dictionaryEntity = "missing";
            expect(
                validateDistributionContract(contract, dictionary)
            ).to.deep.equal([
                {
                    severity: "error",
                    code: "unknown-dictionary-entity",
                    message:
                        "Operation `advanced-search` request references `missing`, which is not an entity of the distribution's data dictionary",
                    location: "/operations/1/request/dictionaryEntity"
                }
            ]);
            // a normalized dictionary works too
            expect(
                codes(contract, normalizeDataDictionary(dictionary))
            ).to.deep.equal(["unknown-dictionary-entity"]);
            contract.operations[1].request.dictionaryEntity = "";
            expect(codes(contract)).to.deep.equal([
                "invalid-dictionary-entity"
            ]);
        });

        it("should report pagination parameters that are not query parameters of the operation", () => {
            const data: any = loadFixture("openapi-rest-query.json");
            const pagination = data.operations[0].response.pagination;
            pagination.limitParameter = "limit";
            // `Accept-Language` exists, but is a header
            pagination.cursorParameter = "Accept-Language";
            expect(
                validateDistributionContract(data).map((issue) => [
                    issue.code,
                    issue.location
                ])
            ).to.deep.equal([
                [
                    "unknown-pagination-parameter",
                    "/operations/0/response/pagination/limitParameter"
                ],
                [
                    "unknown-pagination-parameter",
                    "/operations/0/response/pagination/cursorParameter"
                ]
            ]);
        });

        it("should report invalid JSON pointers", () => {
            const data: any = loadFixture("mixed-provenance.json");
            data.operations[0].response.recordsPath = "items";
            data.operations[0].response.pagination.nextCursorPath =
                "$.paging.nextCursor";
            expect(
                validateDistributionContract(data).map((issue) => [
                    issue.code,
                    issue.location
                ])
            ).to.deep.equal([
                ["invalid-json-pointer", "/operations/0/response/recordsPath"],
                [
                    "invalid-json-pointer",
                    "/operations/0/response/pagination/nextCursorPath"
                ]
            ]);
        });

        it("should escape JSON pointer locations", () => {
            expect(
                validateDistributionContract({
                    schemaVersion: "1.0",
                    operations: [{ id: "a/b" }, { id: "a/b" }]
                })[0].location
            ).to.equal("/operations/1/id");
        });
    });

    describe("normalizeDistributionContract()", () => {
        it("should return undefined for unusable data", () => {
            expect(normalizeDistributionContract(undefined)).to.be.undefined;
            expect(normalizeDistributionContract("x")).to.be.undefined;
            expect(normalizeDistributionContract([])).to.be.undefined;
            expect(normalizeDistributionContract({ operations: [] })).to.be
                .undefined;
        });

        it("should fail closed for missing or unsupported schema versions", () => {
            const data: any = loadFixture("openapi-rest-query.json");
            [undefined, "", "2.0", "2", "10.0", "1.x", "v1", 1, { major: 1 }]
                .map((schemaVersion) => ({ ...data, schemaVersion }))
                .forEach((candidate) => {
                    expect(
                        normalizeDistributionContract(candidate),
                        JSON.stringify(candidate.schemaVersion)
                    ).to.be.undefined;
                });
            ["1", "1.0", "1.1", "1.0.2"].forEach((schemaVersion) => {
                expect(
                    normalizeDistributionContract({ ...data, schemaVersion })
                        ?.schemaVersion
                ).to.equal(schemaVersion);
            });
            expect(
                isSupportedSchemaVersion(DISTRIBUTION_CONTRACT_SCHEMA_VERSION)
            ).to.be.true;
            expect(isSupportedSchemaVersion("2.0")).to.be.false;
        });

        fixtureFiles.forEach((file: string) => {
            it(`should leave valid fixture ${file} unchanged`, () => {
                const data = loadFixture(file);
                expect(normalizeDistributionContract(data)).to.deep.equal(data);
            });
        });

        it("should keep a minimal contract and empty lists", () => {
            expect(
                normalizeDistributionContract({ schemaVersion: "1.0" })
            ).to.deep.equal({ schemaVersion: "1.0" });
            const empty = {
                schemaVersion: "1.0",
                operations: [
                    {
                        id: "a",
                        parameters: [] as any[],
                        response: {
                            mediaTypes: [] as any[],
                            statusCodes: [] as any[]
                        }
                    }
                ],
                sourceCapabilities: {},
                authentication: { type: "none", scopes: [] as any[] },
                specification: {}
            };
            expect(normalizeDistributionContract(empty)).to.deep.equal(empty);
        });

        it("should drop undocumented extension properties", () => {
            const data: any = loadFixture("openapi-rest-query.json");
            data.extension = { a: 1 };
            data.specification.extension = "x";
            data.operations[0].extension = true;
            data.operations[0].parameters[0].extension = "x";
            data.operations[0].response.pagination.extension = 1;
            expect(normalizeDistributionContract(data)).to.deep.equal(
                loadFixture("openapi-rest-query.json")
            );
        });

        it("should never carry undocumented authentication properties", () => {
            const normalized = normalizeDistributionContract({
                schemaVersion: "1.0",
                authentication: {
                    type: "api-key",
                    name: "X-API-Key",
                    location: "header",
                    // must never be stored; never exposed if it is
                    value: "s3cr3t",
                    token: "s3cr3t"
                }
            });
            expect(normalized.authentication).to.deep.equal({
                type: "api-key",
                name: "X-API-Key",
                location: "header"
            });
        });

        it("should keep open source capabilities that are plain JSON", () => {
            const normalized = normalizeDistributionContract({
                schemaVersion: "1.0",
                sourceCapabilities: {
                    allowedMethods: ["GET", 1],
                    maximumRecordsPerRequest: 1.5,
                    bulkExportAvailable: "no",
                    supportsStatistics: true,
                    maxBatchSize: null,
                    nested: { a: [1, "b"] },
                    notJson: () => 1
                },
                operations: [
                    {
                        id: "a",
                        sourceCapabilities: { maximumRecordsPerRequest: 10 }
                    }
                ]
            });
            expect(normalized.sourceCapabilities).to.deep.equal({
                allowedMethods: ["GET"],
                supportsStatistics: true,
                maxBatchSize: null,
                nested: { a: [1, "b"] }
            });
            expect(normalized.operations[0].sourceCapabilities).to.deep.equal({
                maximumRecordsPerRequest: 10
            });
        });

        it("should not let open map keys change object prototypes", () => {
            const normalized = normalizeDistributionContract(
                JSON.parse(
                    `{"schemaVersion": "1.0",
                      "sourceCapabilities": {"__proto__": {"polluted": true}, "ok": 1},
                      "operations": [{"id": "a", "propertyProvenance": {"__proto__": {"method": "manual"}}}]}`
                )
            );
            expect(normalized.sourceCapabilities).to.deep.equal({ ok: 1 });
            expect((normalized.sourceCapabilities as any).polluted).to.be
                .undefined;
            expect(normalized.operations[0]).to.not.have.property(
                "propertyProvenance"
            );
            expect(
                Object.getPrototypeOf(normalized.sourceCapabilities)
            ).to.equal(Object.prototype);
        });

        it("should never invent identities", () => {
            const normalized = normalizeDistributionContract({
                schemaVersion: "1.0",
                operations: [
                    null,
                    // no id: dropped rather than given a made-up one
                    { label: "No id", method: "GET", path: "/x" },
                    { id: "", label: "Empty id" },
                    // the id is never derived from sourceIdentifier/label
                    { sourceIdentifier: "getX", label: "Get X" },
                    {
                        id: "op",
                        parameters: [
                            "junk",
                            {},
                            // no location: identity (location + name) unknown
                            { name: "q", type: "string" },
                            // no name: not derived from sourceIdentifier
                            {
                                sourceIdentifier: "q",
                                location: "query",
                                type: "string"
                            },
                            { name: "", location: "query", type: "string" },
                            { name: "q", location: "", type: "string" },
                            { name: "ok", location: "query", type: {} }
                        ]
                    }
                ]
            });
            expect(normalized.operations).to.deep.equal([
                {
                    id: "op",
                    parameters: [
                        // display fallback only
                        { name: "ok", location: "query", type: "unknown" }
                    ]
                }
            ]);
        });

        it("should drop the credential input authentication describes", () => {
            const normalized = normalizeDistributionContract({
                schemaVersion: "1.0",
                authentication: {
                    type: "api-key",
                    location: "header",
                    name: "X-API-Key"
                },
                operations: [
                    {
                        id: "inherits",
                        parameters: [
                            {
                                name: "x-api-key",
                                location: "header",
                                type: "string",
                                example: "s3cr3t"
                            },
                            // same name, other location: not the credential
                            {
                                name: "X-API-Key",
                                location: "query",
                                type: "string"
                            }
                        ]
                    },
                    {
                        // an empty override is dropped and cannot mask the
                        // contract-level API key
                        id: "empty-override",
                        authentication: {},
                        parameters: [
                            {
                                name: "X-API-Key",
                                location: "header",
                                type: "string"
                            }
                        ]
                    },
                    {
                        id: "own-api-key",
                        authentication: {
                            type: "api-key",
                            location: "query",
                            name: "key"
                        },
                        parameters: [
                            { name: "key", location: "query", type: "string" },
                            // not the credential of this operation
                            {
                                name: "X-API-Key",
                                location: "header",
                                type: "string"
                            }
                        ]
                    }
                ]
            });
            const parameters = (idx: number) =>
                normalized.operations[idx].parameters.map(
                    (p) => `${p.location}:${p.name}`
                );
            expect(parameters(0)).to.deep.equal(["query:X-API-Key"]);
            expect(normalized.operations[1]).to.not.have.property(
                "authentication"
            );
            expect(parameters(1)).to.deep.equal([]);
            expect(parameters(2)).to.deep.equal(["header:X-API-Key"]);
            // the consumer-facing (normalized) contract has no credential
            // parameters left
            expect(
                validateDistributionContract(normalized).filter(
                    (issue) => issue.code === "credential-parameter"
                )
            ).to.deep.equal([]);
        });

        it("should drop authentication without a type and empty identifiers", () => {
            const normalized = normalizeDistributionContract({
                schemaVersion: "1.0",
                authentication: { description: "Ask the custodian" },
                operations: [
                    {
                        id: "op",
                        sourceIdentifier: "",
                        authentication: {
                            type: "api-key",
                            location: "",
                            name: ""
                        },
                        parameters: [
                            {
                                name: "q",
                                location: "query",
                                type: "string",
                                sourceIdentifier: ""
                            }
                        ]
                    }
                ]
            });
            expect(normalized).to.not.have.property("authentication");
            const operation = normalized.operations[0];
            expect(operation).to.not.have.property("sourceIdentifier");
            expect(operation.authentication).to.deep.equal({ type: "api-key" });
            expect(operation.parameters[0]).to.not.have.property(
                "sourceIdentifier"
            );
            expect(getParameterIdentity(operation.parameters[0])).to.equal(
                "location:query:q"
            );
        });

        it("should drop credential header parameters the schema rejects", () => {
            const normalized = normalizeDistributionContract({
                schemaVersion: "1.0",
                operations: [
                    {
                        id: "op",
                        parameters: [
                            {
                                name: "Authorization",
                                location: "header",
                                type: "string",
                                example: "Bearer abc"
                            },
                            {
                                name: "authorization",
                                location: "query",
                                type: "string"
                            },
                            {
                                name: "X-Request-Id",
                                location: "header",
                                type: "string"
                            }
                        ]
                    }
                ]
            });
            expect(
                normalized.operations[0].parameters.map(
                    (p) => `${p.location}:${p.name}`
                )
            ).to.deep.equal(["query:authorization", "header:X-Request-Id"]);
        });

        it("should keep arbitrary JSON values the schema allows", () => {
            const values: { [key: string]: unknown } = {
                enum: [null, "A", 1, true, { code: "B" }, ["C"]],
                default: null,
                example: { lat: -35.3, lon: 149.1 }
            };
            const normalized = normalizeDistributionContract({
                schemaVersion: "1.0",
                operations: [
                    {
                        id: "op",
                        parameters: [
                            {
                                name: "a",
                                location: "query",
                                type: "string",
                                ...values
                            },
                            {
                                name: "b",
                                location: "query",
                                type: "boolean",
                                default: false,
                                example: []
                            }
                        ]
                    }
                ]
            });
            const [a, b] = normalized.operations[0].parameters;
            expect(a).to.deep.equal({
                name: "a",
                location: "query",
                type: "string",
                ...values
            });
            expect(b.default).to.equal(false);
            expect(b.example).to.deep.equal([]);
        });

        it("should keep the empty JSON pointer and string status codes", () => {
            const normalized = normalizeDistributionContract({
                schemaVersion: "1.0",
                operations: [
                    {
                        id: "op",
                        response: {
                            recordsPath: "",
                            statusCodes: [200, "2XX", 200.5, null]
                        }
                    }
                ]
            });
            expect(normalized.operations[0].response).to.deep.equal({
                recordsPath: "",
                statusCodes: [200, "2XX"]
            });
        });

        it("should drop provenance that cannot override inherited provenance", () => {
            const normalized = normalizeDistributionContract({
                schemaVersion: "1.0",
                provenance: {
                    method: "manual",
                    reviewStatus: "custodian-approved"
                },
                operations: [
                    {
                        id: "op",
                        provenance: { generator: "x" },
                        parameters: [
                            {
                                name: "a",
                                location: "query",
                                type: "string",
                                provenance: {},
                                propertyProvenance: {
                                    description: { method: {} },
                                    type: { reviewStatus: "reviewed" }
                                }
                            }
                        ]
                    }
                ]
            });
            const operation = normalized.operations[0];
            const parameter = operation.parameters[0];
            expect(operation).to.not.have.property("provenance");
            expect(parameter).to.not.have.property("provenance");
            expect(parameter.propertyProvenance).to.deep.equal({
                type: { reviewStatus: "reviewed" }
            });
            expect(
                isProtectedProvenance(
                    getEffectiveProvenance(normalized, [operation, parameter])
                )
            ).to.be.true;
        });

        it("should deeply sanitize malformed nested values", () => {
            const bad = {};
            const provenance = {
                method: bad,
                reviewStatus: ["reviewed"],
                generator: 1
            };
            const normalized = normalizeDistributionContract({
                schemaVersion: "1.0",
                resourceRole: bad,
                accessMode: 1,
                protocol: ["REST"],
                endpointUrl: bad,
                documentationUrl: null,
                specification: { type: bad, url: ["x"], fingerprint: "f" },
                authentication: {
                    type: bad,
                    description: 1,
                    scopes: [bad, "read"]
                },
                provenance,
                lastVerified: 1,
                sourceCapabilities: "all",
                operations: [
                    {
                        id: "op",
                        sourceIdentifier: bad,
                        label: bad,
                        purpose: [],
                        interactionType: 1,
                        method: bad,
                        path: 1,
                        endpointUrl: bad,
                        interactiveExampleCandidate: "yes",
                        authentication: "oauth2",
                        request: {
                            required: "yes",
                            mediaTypes: "application/json",
                            dictionaryEntity: ""
                        },
                        response: {
                            mediaTypes: [bad, "application/json"],
                            recordsPath: "records",
                            dictionaryEntity: bad,
                            pagination: {
                                type: bad,
                                limitParameter: "",
                                offsetParameter: bad,
                                nextCursorPath: "$.next",
                                totalPath: "/total"
                            }
                        },
                        provenance: "manual",
                        propertyProvenance: { purpose: "manual", x: [] },
                        parameters: [
                            {
                                name: "q",
                                location: "query",
                                type: "string",
                                sourceIdentifier: bad,
                                description: bad,
                                format: bad,
                                required: "true",
                                // any JSON value is valid here; non-JSON
                                // values (NaN, functions) are not
                                enum: [bad, "a", [1], 2, null],
                                default: bad,
                                example: () => 1,
                                minimum: bad,
                                maximum: [],
                                minLength: "1",
                                maxLength: -1,
                                pattern: bad,
                                unit: bad,
                                provenance,
                                propertyProvenance: {
                                    description: provenance,
                                    type: bad
                                }
                            },
                            {
                                name: "r",
                                location: "query",
                                type: "number",
                                enum: [NaN]
                            }
                        ]
                    }
                ]
            });
            expect(normalized).to.deep.equal({
                schemaVersion: "1.0",
                specification: { fingerprint: "f" },
                // no valid `type`: dropped rather than masking anything
                operations: [
                    {
                        id: "op",
                        request: {},
                        response: {
                            mediaTypes: ["application/json"],
                            pagination: { totalPath: "/total" }
                        },
                        parameters: [
                            {
                                name: "q",
                                location: "query",
                                type: "string",
                                enum: [bad, "a", [1], 2, null],
                                default: bad
                            },
                            { name: "r", location: "query", type: "number" }
                        ]
                    }
                ]
            });
        });
    });
});

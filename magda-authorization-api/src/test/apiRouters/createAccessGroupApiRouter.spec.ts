import {} from "mocha";
import request from "supertest";
import express from "express";
import nock from "nock";
import { expect } from "chai";
import sinon from "sinon";
import addJwtSecretFromEnvVar from "magda-typescript-common/src/session/addJwtSecretFromEnvVar.js";
import fakeArgv from "magda-typescript-common/src/test/fakeArgv.js";
import buildJwt from "magda-typescript-common/src/session/buildJwt.js";
import createMockAuthDecisionQueryClient from "magda-typescript-common/src/test/createMockAuthDecisionQueryClient.js";
import mockDatabase from "../mockDatabase.js";
import Database from "../../Database.js";
import createAccessGroupApiRouter from "../../apiRouters/createAccessGroupApiRouter.js";
import {
    UnconditionalTrueDecision,
    UnconditionalFalseDecision
} from "@magda/typescript-common/dist/opa/AuthDecision.js";
import AuthorizedRegistryClient from "magda-typescript-common/src/registry/AuthorizedRegistryClient.js";
import { v4 as uuidV4 } from "uuid";

const REGISTRY_BASE_URL = "http://localhost:6101/v0";

describe("Access Group API Router", function () {
    this.timeout(5000);

    let app: express.Express;
    let argv: any;
    let db: any;
    let registryScope: nock.Scope;
    let executedQueries: { query: string; params: unknown[] }[] = [];
    let createPermissionCalls: any[] = [];
    let registryRequestBody: any;
    let currentGroupDetails: any;
    let datasetRecordMock: any;
    let mergeParamSeen: boolean;
    let mergeParamSeenControl: boolean;
    let patchBody: any;
    let accessControlPatched: boolean; // Added flag
    // users / roles that table lookups should report as missing
    let missingRecordIds: Set<string>;
    // operation URIs the router asked the auth decision client for, and those to deny
    let requestedOperations: string[];
    let deniedOperations: Set<string>;
    // when true, the group's stored role doesn't hold the group's permission
    let roleMismatch: boolean;
    // when true, the group's control permissions aren't the group's own
    let controlMismatch: boolean;
    // record IDs whose `object/record/update` decision is denied
    let deniedRecordIds: Set<string>;
    // when true, the caller has no unconstrained `object/accessGroup/update`
    let notUnconstrained: boolean;
    // every decision request config, in order
    let decisionConfigs: any[];
    // extra records the registry GET mock returns
    let extraRecords: Record<string, any>;

    before(function () {
        nock.disableNetConnect();
        nock.enableNetConnect("127.0.0.1");
        argv = addJwtSecretFromEnvVar(
            fakeArgv({
                listenPort: 6014,
                dbHost: "localhost",
                dbPort: 5432,
                jwtSecret: "squirrel"
            })
        );
    });

    beforeEach(function () {
        // Ensure a clean nock state and strict network control for each test
        nock.disableNetConnect();
        nock.enableNetConnect("127.0.0.1");
        if (!nock.isActive()) {
            // Ensure nock is active after cleaning and net connect setup
            nock.activate();
        }
        nock.cleanAll();

        executedQueries = [];
        createPermissionCalls = [];
        registryRequestBody = undefined;
        mergeParamSeen = false;
        mergeParamSeenControl = false;
        patchBody = undefined;
        accessControlPatched = false;
        missingRecordIds = new Set();
        requestedOperations = [];
        deniedOperations = new Set();
        roleMismatch = false;
        controlMismatch = false;
        deniedRecordIds = new Set();
        notUnconstrained = false;
        decisionConfigs = [];
        extraRecords = {};
        db = new mockDatabase();
        db.deleteRole = async () => {};
        let permissionIdCounter = 1;
        db.setDbPool({
            // Simplified, ensure this doesn't interfere if it also makes external calls
            connect: async () => ({
                query: async (queryOrConfig: any, values?: any[]) => {
                    const query = queryOrConfig.text ?? queryOrConfig;
                    const params = queryOrConfig.values ?? values ?? [];
                    executedQueries.push({ query, params });
                    if (query.toLowerCase().includes('insert into "roles"')) {
                        return {
                            rows: [
                                {
                                    id: "mock-role-id",
                                    name: "auto-created for access group",
                                    description:
                                        "auto-created for access group mock-record-id",
                                    create_by: null as string | null,
                                    owner_id: null as string | null,
                                    edit_by: null as string | null
                                }
                            ]
                        };
                    }
                    return { rows: [] };
                },
                release: () => {}
            }),
            query: async (queryOrConfig: any, values?: any[]) => {
                const query = queryOrConfig.text ?? queryOrConfig;
                const params = queryOrConfig.values ?? values ?? [];
                executedQueries.push({ query, params });
                // getTableRecord lookups of users and roles by id
                if (
                    /^\s*select\b/i.test(query) &&
                    /from\s+"?(users|roles)"?\s+where\s+id\s*=/i.test(query) &&
                    typeof params[0] === "string"
                ) {
                    return {
                        rows: missingRecordIds.has(params[0])
                            ? []
                            : [{ id: params[0] }]
                    };
                }
                // the group integrity check: the stored role is the group's member role
                if (/from\s+roles\s+r\s+join\s+role_permissions/i.test(query)) {
                    return { rows: roleMismatch ? [] : [{ exists: 1 }] };
                }
                // the group integrity check: the control permissions are the group's own
                if (/count\(\*\).*from\s+permissions/is.test(query)) {
                    const ids = (params.find((p: any) => Array.isArray(p)) ||
                        []) as string[];
                    return {
                        rows: [
                            {
                                count: controlMismatch
                                    ? Math.max(0, ids.length - 1)
                                    : ids.length
                            }
                        ]
                    };
                }
                return { rows: [] as unknown[] };
            }
        });
        db.createPermission = async (data: any) => {
            createPermissionCalls.push(data);
            return {
                id: `mock-permission-id-${permissionIdCounter++}`,
                ...data
            };
        };

        registryScope = nock(REGISTRY_BASE_URL);

        currentGroupDetails = {
            id: "test-group-id",
            name: "Test Group Initial Name",
            aspects: {
                "access-group-details": {
                    name: "Old Name",
                    description: "Old desc",
                    resourceUri: "object/record",
                    keywords: ["old"],
                    operationUris: ["object/record/read"],
                    permissionId: uuidV4(),
                    roleId: uuidV4(),
                    extraControlPermissionIds: [uuidV4(), uuidV4()]
                },
                "access-control": {
                    ownerId: null as string | null,
                    orgUnitId: null as string | null,
                    preAuthorisedPermissionIds: [uuidV4()]
                }
            }
        };

        datasetRecordMock = {
            id: "test-dataset-id",
            name: "Test Dataset",
            aspects: {
                "dataset-distributions": {
                    distributions: ["dist-1", "dist-2"] as string[]
                },
                "access-control": {
                    // Datasets can also have access-control
                    ownerId: "dataset-owner-uuid",
                    orgUnitId: null as string | null // Explicitly typed
                }
            }
        };

        // Remove the overly broad GET nock and replace with a more comprehensive one.
        registryScope
            .persist()
            .get(/.*/) // Still broad, but the reply function will be more specific
            .reply(function (this: any, uri: string) {
                const requestUrl = new URL(uri, REGISTRY_BASE_URL);
                const pathname = requestUrl.pathname;

                // Handle general record queries like /records?aspectQuery=...
                if (
                    pathname === "/v0/records" &&
                    requestUrl.searchParams.has("aspectQuery")
                ) {
                    return [200, { records: [] }];
                }

                const recordIdMatch = pathname.match(
                    /\/records\/(?:inFull\/)?([^\/?\s]+)/
                );
                const recordId = recordIdMatch ? recordIdMatch[1] : null;

                let targetRecord: any = null;
                if (recordId === currentGroupDetails.id) {
                    targetRecord = currentGroupDetails;
                } else if (recordId === datasetRecordMock.id) {
                    targetRecord = datasetRecordMock;
                } else if (recordId && extraRecords[recordId]) {
                    targetRecord = extraRecords[recordId];
                }

                if (targetRecord) {
                    const aspectDirectMatch = pathname.match(
                        /\/aspects\/([^\/?\s]+)/
                    );
                    if (aspectDirectMatch) {
                        const aspectName = aspectDirectMatch[1];
                        if (targetRecord.aspects[aspectName]) {
                            return [
                                200,
                                { ...targetRecord.aspects[aspectName] }
                            ];
                        }
                        return [
                            404,
                            {
                                message: `Aspect ${aspectName} not found for record ${recordId}`
                            }
                        ];
                    }

                    // Handle /inFull/ or requests with aspect query params
                    const aspectsParam = requestUrl.searchParams.getAll(
                        "aspect"
                    );
                    const optionalAspectsParam = requestUrl.searchParams.getAll(
                        "optionalAspect"
                    );

                    if (
                        pathname.includes("/inFull/") ||
                        aspectsParam.length > 0 ||
                        optionalAspectsParam.length > 0
                    ) {
                        const recordToReturn: any = {
                            id: targetRecord.id,
                            name: targetRecord.name,
                            aspects: {}
                        };
                        const allRequestedAspectNames = new Set([
                            ...aspectsParam,
                            ...optionalAspectsParam
                        ]);
                        if (
                            pathname.includes("/inFull/") ||
                            (allRequestedAspectNames.size === 0 &&
                                !pathname.includes("/aspects/"))
                        ) {
                            recordToReturn.aspects = {
                                ...targetRecord.aspects
                            };
                        } else {
                            allRequestedAspectNames.forEach((aspectName) => {
                                if (targetRecord.aspects[aspectName]) {
                                    recordToReturn.aspects[aspectName] =
                                        targetRecord.aspects[aspectName];
                                }
                            });
                        }
                        return [200, recordToReturn];
                    }

                    // Fallback for GET /records/{recordId} (implies full record)
                    return [200, { ...targetRecord }];
                }

                return [
                    404,
                    { message: `Comprehensive GET nock did not match ${uri}` }
                ];
            });

        const apiRouter = createAccessGroupApiRouter({
            jwtSecret: argv.jwtSecret,
            database: (db as unknown) as Database,
            authDecisionClient: createMockAuthDecisionQueryClient(
                async (config: any) => {
                    requestedOperations.push(config.operationUri);
                    decisionConfigs.push(config);
                    const recordId = config?.input?.object?.record?.id;
                    const groupId = config?.input?.object?.accessGroup?.id;
                    if (
                        deniedOperations.has(config.operationUri) ||
                        (recordId && deniedRecordIds.has(recordId)) ||
                        (notUnconstrained &&
                            groupId === "unconstrained-access-group-check")
                    ) {
                        return UnconditionalFalseDecision;
                    }
                    return UnconditionalTrueDecision;
                }
            ),
            registryClient: new AuthorizedRegistryClient({
                baseUrl: REGISTRY_BASE_URL,
                jwtSecret: argv.jwtSecret,
                userId: "test-user-id",
                tenantId: 0,
                maxRetries: 0
            })
        });
        app = express();
        app.use(express.json({ limit: "100mb" }));
        app.use("/v0/auth/accessGroups", apiRouter);
    });

    afterEach(function () {
        db.resetDbPool();
        nock.cleanAll();
    });

    after(() => {
        nock.cleanAll();
        nock.enableNetConnect();
    });

    function silenceErrorLogs(inner: () => void) {
        describe("With silent console.error or console.warn:", () => {
            beforeEach(() => {
                sinon.stub(console, "error").callsFake(() => {});
                sinon.stub(console, "warn").callsFake(() => {});
            });

            afterEach(() => {
                (console.error as any).restore();
                (console.warn as any).restore();
            });

            inner();
        });
    }

    describe("POST /v0/auth/accessGroups", () => {
        it("should create an access group and call registry API with correct permission data", async () => {
            // Arrange: mock registry createRecord endpoint
            registryScope
                .post("/records", (body) => {
                    registryRequestBody = body;
                    return true;
                })
                .reply(200, () => {
                    return { id: registryRequestBody.id };
                });
            const ownerId = uuidV4();
            const reqBody: {
                name: string;
                description: string;
                resourceUri: string;
                keywords: string[];
                operationUris: string[];
                ownerId: string | null;
                orgUnitId: string | null;
            } = {
                name: "Test Group 123",
                description: "desc 123",
                resourceUri: "object/record",
                keywords: ["a", "b"],
                operationUris: ["object/record/read", "object/record/update"],
                ownerId: ownerId,
                orgUnitId: null
            };

            // Act
            const res = await request(app)
                .post("/v0/auth/accessGroups")
                .send(reqBody);

            // Assert
            expect(res.status).to.equal(200);
            expect(res.body).to.have.property("id");

            // --- Registry body assertions
            expect(registryRequestBody.name).to.equal(reqBody.name);
            const agd = registryRequestBody.aspects["access-group-details"];
            expect(agd.name).to.equal(reqBody.name);
            expect(agd.description).to.equal(reqBody.description);
            expect(agd.operationUris).to.deep.equal(reqBody.operationUris);
            expect(agd.permissionId).to.equal("mock-permission-id-1");
            expect(agd.roleId).to.equal("mock-role-id");
            expect(agd.extraControlPermissionIds).to.deep.equal([
                "mock-permission-id-2"
            ]);
            const ac = registryRequestBody.aspects["access-control"];
            expect(ac.ownerId).to.equal(reqBody.ownerId);
            expect(ac.preAuthorisedPermissionIds).to.deep.equal([
                "mock-permission-id-2"
            ]);

            // Permission assertions
            expect(createPermissionCalls.length).to.equal(2);
            // 1. Group item permission
            expect(createPermissionCalls[0].resourceUri).to.equal(
                "object/record"
            );
            expect(createPermissionCalls[0].operationUris).to.deep.equal([
                "object/record/read",
                "object/record/update"
            ]);
            // 2. Members' pre-authorised read of the group record (also shows the UI)
            expect(createPermissionCalls[1].resourceUri).to.equal(
                "object/accessGroup"
            );
            expect(createPermissionCalls[1].operationUris).to.deep.equal([
                "object/accessGroup/read"
            ]);
            expect(createPermissionCalls[1].preAuthorisedConstraint).to.equal(
                true
            );

            // SQL assertions
            const rolesInsertQuery = executedQueries.find((q) =>
                q.query.toLowerCase().includes('insert into "roles"')
            );
            expect(rolesInsertQuery).to.not.be.undefined;
            expect(rolesInsertQuery.params[0]).to.equal(
                "auto-created for access group"
            );

            const rolePermissionsInsertQuery = executedQueries.find((q) =>
                q.query.toLowerCase().includes("insert into role_permissions")
            );
            expect(rolePermissionsInsertQuery).to.not.be.undefined;
            expect(rolePermissionsInsertQuery.params).to.deep.equal([
                "mock-role-id",
                "mock-permission-id-1",
                "mock-role-id",
                "mock-permission-id-2"
            ]);
        });

        silenceErrorLogs(() => {
            it("should return 400 if name is missing", async () => {
                const reqBody = {
                    description: "desc",
                    resourceUri: "object/record",
                    keywords: ["a", "b"],
                    operationUris: ["object/record/read"]
                };
                const res = await request(app)
                    .post("/v0/auth/accessGroups")
                    .send(reqBody);
                expect(res.status).to.equal(400);
                expect(res.body).to.have.property("isError", true);
            });
        });
    });

    describe("PUT /v0/auth/accessGroups/:groupId", () => {
        it("should update an access group and call registry API with correct patch", async () => {
            const groupId = "test-group-id";
            // we don't want to use nocking
            // Clean all nocks before setting up new ones
            nock.cleanAll();
            const ownerId = uuidV4();
            // 1. Nock for the initial GET /inFull/test-group-id
            // This uses currentGroupDetails as it is defined in beforeEach (initial state)
            const getInFullNock = nock(REGISTRY_BASE_URL)
                .get("/records/inFull/test-group-id")
                .reply(200, {
                    id: currentGroupDetails.id,
                    name: currentGroupDetails.name,
                    aspects: { ...currentGroupDetails.aspects }
                });

            // 2. Nock for PUT to access-group-details for the name update (changed from PATCH)
            const putAccessGroupDetailsNock = nock(REGISTRY_BASE_URL)
                .put(
                    "/records/test-group-id/aspects/access-group-details?merge=true",
                    (body) => {
                        // Check if the body contains the updated name and an editTime field
                        const isMatch =
                            body &&
                            body.name === "Updated Name" &&
                            typeof body.editTime === "string";
                        return isMatch;
                    }
                )
                .reply(200, (uri, requestBody: any) => {
                    // Simulate the aspect after the PUT
                    const updatedAspect = {
                        ...currentGroupDetails.aspects["access-group-details"],
                        name: requestBody.name, // Use name from requestBody
                        editTime: requestBody.editTime // Persist editTime from requestBody
                    };
                    // Also update the top-level currentGroupDetails.name if it's part of this aspect update
                    currentGroupDetails.name = requestBody.name;
                    currentGroupDetails.aspects[
                        "access-group-details"
                    ] = updatedAspect; // Update the main mock data

                    mergeParamSeen = true; // Set flag as this is a PUT with merge=true

                    return updatedAspect;
                });

            // 3. Nock for PUT to access-control for the ownerId update
            const putAccessControlNock = nock(REGISTRY_BASE_URL)
                .put(
                    "/records/test-group-id/aspects/access-control?merge=true",
                    (body) => {
                        const isMatch = body && body.ownerId === ownerId;
                        return isMatch;
                    }
                )
                .reply(200, (uri, requestBody: any) => {
                    // Simulate the aspect after the PUT
                    const updatedAspect = {
                        ...currentGroupDetails.aspects["access-control"],
                        ownerId: requestBody.ownerId
                    };
                    currentGroupDetails.aspects[
                        "access-control"
                    ] = updatedAspect; // Update the main mock data

                    mergeParamSeenControl = true; // Set flag as this is a PUT with merge=true

                    return updatedAspect;
                });

            // 4. Nock for the GET request to fetch the record with specific aspects after updates
            const getUpdatedRecordNock = nock(REGISTRY_BASE_URL)
                .get(
                    "/records/test-group-id?aspect=access-group-details&optionalAspect=access-control&dereference=false"
                )
                .reply(200, () => {
                    // currentGroupDetails should have been updated by the .reply() functions of the PUT nocks
                    return {
                        id: currentGroupDetails.id,
                        name: currentGroupDetails.name, // This should be "Updated Name"
                        aspects: {
                            "access-group-details": {
                                ...currentGroupDetails.aspects[
                                    "access-group-details"
                                ]
                            },
                            "access-control": {
                                ...currentGroupDetails.aspects["access-control"]
                            }
                        }
                    };
                });

            const reqBody = {
                name: "Updated Name",
                ownerId: ownerId
            };

            // Act
            const res = await request(app)
                .put(`/v0/auth/accessGroups/${groupId}`)
                .send(reqBody);

            // Assert
            expect(res.status).to.equal(200);

            expect(
                getInFullNock.isDone(),
                "GET /inFull/test-group-id nock should have been called"
            ).to.be.true;
            expect(
                putAccessGroupDetailsNock.isDone(),
                "PUT /aspects/access-group-details?merge=true nock should be called for name update"
            ).to.be.true;
            expect(
                putAccessControlNock.isDone(),
                "PUT /aspects/access-control?merge=true nock should be called for ownerId update"
            ).to.be.true;
            expect(
                getUpdatedRecordNock.isDone(),
                "GET /records/test-group-id?aspect=... nock should have been called after updates"
            ).to.be.true;

            let nameInResponseCorrect = false;
            if (res.body && typeof res.body === "object") {
                if ("name" in res.body && res.body.name === "Updated Name") {
                    nameInResponseCorrect = true;
                } else if (
                    res.body.aspects &&
                    res.body.aspects["access-group-details"] &&
                    res.body.aspects["access-group-details"].name ===
                        "Updated Name"
                ) {
                    nameInResponseCorrect = true;
                }
            }
            expect(
                nameInResponseCorrect,
                "Response body should contain updated name"
            ).to.be.true;

            // Assert that access-group-details.name was updated in the mock registry
            expect(
                currentGroupDetails.aspects["access-group-details"]?.name,
                "Name in mock registry should be updated"
            ).to.equal("Updated Name");

            const accessGroupDetailsUpdatedViaAspectEndpoint =
                patchBody !== undefined || mergeParamSeen === true;
            expect(
                accessGroupDetailsUpdatedViaAspectEndpoint,
                "access-group-details should have been updated via aspect-specific PATCH or PUT with merge=true"
            ).to.be.true;

            if (patchBody !== undefined) {
                expect(patchBody).to.be.an("array");
                const namePatchOp = (patchBody as any[]).find(
                    (op) => op.path === "/name" && op.op === "replace"
                );
                if (namePatchOp) {
                    expect(namePatchOp.value).to.equal("Updated Name");
                }
            }

            if (reqBody.ownerId) {
                // Assert that access-control.ownerId was updated in the mock registry
                expect(
                    currentGroupDetails.aspects["access-control"]?.ownerId,
                    "ownerId in mock registry should be updated"
                ).to.equal(reqBody.ownerId);

                // Assert that the access-control aspect was interacted with via an aspect-specific endpoint (PATCH or PUT with merge=true)
                // For this test, we are specifically nocking a PUT with merge=true for access-control
                expect(
                    mergeParamSeenControl,
                    "access-control aspect should have been updated via PUT with merge=true"
                ).to.be.true;
                expect(
                    accessControlPatched,
                    "accessControlPatched should be false as access-control was updated via PUT"
                ).to.be.false;
            }
        });
    });

    describe("DELETE /v0/auth/accessGroups/:groupId", () => {
        it("should delete an access group and call registry API with correct parameters", async () => {
            const groupId = uuidV4();
            const validPermissionId = uuidV4();
            const validRoleId = uuidV4();
            const validExtraPermissionId1 = uuidV4();
            const validExtraPermissionId2 = uuidV4();
            const originalGroup = {
                id: groupId,
                aspects: {
                    "access-group-details": {
                        permissionId: validPermissionId,
                        roleId: validRoleId,
                        extraControlPermissionIds: [
                            validExtraPermissionId1,
                            validExtraPermissionId2
                        ]
                    },
                    "access-control": {
                        ownerId: null as string | null,
                        orgUnitId: null as string | null,
                        preAuthorisedPermissionIds: [validExtraPermissionId1]
                    }
                }
            };
            currentGroupDetails = originalGroup; // Update the mock group details
            let deleteEndpointCalled = false;
            registryScope.delete(`/records/${groupId}`).reply(200, () => {
                deleteEndpointCalled = true;
                return { deleted: true };
            });
            // Act
            const res = await request(app)
                .delete(`/v0/auth/accessGroups/${groupId}`)
                .send();
            // Assert
            expect(deleteEndpointCalled).to.be.true;
            expect(res.status).to.equal(200);
            expect(res.body.result).to.equal(true);
            expect(
                executedQueries.some((q) =>
                    q.query.toLowerCase().includes("delete from user_roles")
                )
            ).to.be.true;
            expect(
                executedQueries.some((q) =>
                    q.query.toLowerCase().includes("delete from permissions")
                )
            ).to.be.true;
        });
    });

    describe("POST /v0/auth/accessGroups/:groupId/datasets/:datasetId", () => {
        it("should add a dataset to an access group and call registry API with correct parameters", async () => {
            const groupId = uuidV4();
            const datasetId = uuidV4();
            const validPermissionId = uuidV4();
            const originalGroup = {
                id: groupId,
                aspects: {
                    "access-group-details": {
                        permissionId: validPermissionId
                    }
                }
            };
            currentGroupDetails = originalGroup; // Update the mock group details
            const distId1 = uuidV4();
            const distId2 = uuidV4();
            const datasetRecord = {
                id: datasetId,
                aspects: {
                    "dataset-distributions": {
                        distributions: [distId1, distId2]
                    }
                }
            };
            datasetRecordMock = datasetRecord; // Update the mock dataset record
            // the listed distributions exist (each is authorised before the write)
            [distId1, distId2].forEach((id) => {
                extraRecords[id] = { id, name: id, aspects: {} };
            });
            let putRecordsAspectBody: any = undefined;
            let mergeParamSeen = false;
            registryScope
                .put(`/records/aspects/access-control`, (body) => {
                    putRecordsAspectBody = body;
                    return true;
                })
                .query((actualQuery) => {
                    mergeParamSeen = actualQuery.merge === "true";
                    return true;
                })
                .reply(200, {});
            registryScope
                .put(
                    `/records/${groupId}/aspects/access-group-details?merge=true`,
                    (body) => {
                        expect(body).to.has.property("editTime");
                        return true;
                    }
                )
                .reply(200, {});
            // Act
            const res = await request(app)
                .post(`/v0/auth/accessGroups/${groupId}/datasets/${datasetId}`)
                .send();
            // Assert
            expect(res.status).to.equal(200);
            expect(res.body.result).to.equal(true);
            expect(putRecordsAspectBody).to.be.an("object");
            expect(putRecordsAspectBody).to.deep.equal({
                recordIds: [distId1, distId2, datasetId],
                data: {
                    preAuthorisedPermissionIds: [validPermissionId]
                }
            });
            expect(mergeParamSeen).to.be.true;
        });
    });

    describe("DELETE /v0/auth/accessGroups/:groupId/datasets/:datasetId", () => {
        it("should remove a dataset from an access group and call registry API with correct parameters", async () => {
            const groupId = uuidV4();
            const datasetId = uuidV4();
            const validPermissionId = uuidV4();
            const originalGroup = {
                id: groupId,
                aspects: {
                    "access-group-details": {
                        permissionId: validPermissionId
                    }
                }
            };
            currentGroupDetails = originalGroup; // Update the mock group details
            const distId1 = uuidV4();
            const distId2 = uuidV4();
            const datasetRecord = {
                id: datasetId,
                aspects: {
                    "dataset-distributions": {
                        distributions: [distId1, distId2] as string[]
                    }
                }
            };
            datasetRecordMock = datasetRecord; // Update the mock dataset record
            // the listed distributions exist (each is authorised before the write)
            [distId1, distId2].forEach((id) => {
                extraRecords[id] = { id, name: id, aspects: {} };
            });
            let deleteRecordsAspectArrayItemsBody: any = undefined;

            // Update nock to match DELETE /v0/records/aspectArrayItems/access-control
            registryScope
                .delete(`/records/aspectArrayItems/access-control`, (body) => {
                    deleteRecordsAspectArrayItemsBody = body;
                    return true;
                })
                .reply(200, {});
            registryScope
                .put(
                    `/records/${groupId}/aspects/access-group-details?merge=true`,
                    (body) => {
                        expect(body).to.has.property("editTime");
                        return true;
                    }
                )
                .reply(200, {});
            // Act
            const res = await request(app)
                .delete(
                    `/v0/auth/accessGroups/${groupId}/datasets/${datasetId}`
                )
                .send();
            // Assert
            expect(res.status).to.equal(200);
            expect(res.body.result).to.equal(true);
            expect(deleteRecordsAspectArrayItemsBody).to.deep.equal({
                recordIds: [datasetId, distId1, distId2],
                jsonPath: "$.preAuthorisedPermissionIds",
                items: [validPermissionId]
            });
        });
    });

    describe("POST /v0/auth/accessGroups/:groupId/users/:userId", () => {
        it("should add a user to an access group and execute correct SQL", async () => {
            const groupId = uuidV4();
            const userId = uuidV4();
            const validRoleId = uuidV4();
            const originalGroup = {
                id: groupId,
                aspects: {
                    "access-group-details": {
                        roleId: validRoleId,
                        permissionId: uuidV4()
                    }
                }
            };
            currentGroupDetails = originalGroup; // Update the mock group details
            // Add missing nock for PUT /v0/records/:groupId/aspects/access-group-details?merge=true
            registryScope
                .put(
                    `/records/${groupId}/aspects/access-group-details?merge=true`,
                    (body) => {
                        expect(body).to.has.property("editTime");
                        return true;
                    }
                )
                .reply(200, {});
            // Ensure user exists in mock database
            if (typeof db.createUser === "function") {
                await db.createUser({
                    id: userId,
                    displayName: "Test User",
                    email: "test@example.com",
                    photoURL: "",
                    source: "test-source",
                    sourceId: "test-source-id"
                });
            }
            // Act
            const res = await request(app)
                .post(`/v0/auth/accessGroups/${groupId}/users/${userId}`)
                .send();
            // Assert
            expect(res.status).to.equal(200);
            expect(res.body.result).to.equal(true);
            expect(
                // added access group managed role to the user
                executedQueries.some(
                    (q) =>
                        q.query
                            .toLowerCase()
                            .includes("insert into user_roles") &&
                        q.params.includes(userId) &&
                        q.params.includes(validRoleId)
                )
            ).to.be.true;
        });
    });

    describe("DELETE /v0/auth/accessGroups/:groupId/users/:userId", () => {
        it("should remove a user from an access group and execute correct SQL", async () => {
            const groupId = uuidV4();
            const userId = uuidV4();
            const validRoleId = uuidV4();
            const originalGroup = {
                id: groupId,
                aspects: {
                    "access-group-details": {
                        roleId: validRoleId,
                        permissionId: uuidV4()
                    }
                }
            };
            currentGroupDetails = originalGroup; // Update the mock group details
            // Add missing nock for PUT /v0/records/:groupId/aspects/access-group-details?merge=true
            registryScope
                .put(
                    `/records/${groupId}/aspects/access-group-details?merge=true`,
                    (body) => {
                        expect(body).to.has.property("editTime");
                        return true;
                    }
                )
                .reply(200, {});
            // Ensure user exists in mock database
            if (typeof db.createUser === "function") {
                await db.createUser({
                    id: userId,
                    displayName: "Test User",
                    email: "test@example.com",
                    photoURL: "",
                    source: "test-source",
                    sourceId: "test-source-id"
                });
            }
            // Act
            const res = await request(app)
                .delete(`/v0/auth/accessGroups/${groupId}/users/${userId}`)
                .send();
            // Assert
            expect(res.status).to.equal(200);
            expect(res.body.result).to.be.oneOf([true, false]);
            expect(
                executedQueries.some(
                    (q) =>
                        q.query
                            .toLowerCase()
                            .includes("delete from user_roles") &&
                        q.params.includes(userId) &&
                        q.params.includes(validRoleId)
                )
            ).to.be.true;
        });
    });

    describe("GET /v0/auth/accessGroups/:groupId/users", () => {
        it("should list users in an access group and execute correct SQL", async () => {
            executedQueries = [];
            const groupId = uuidV4();
            const userId = uuidV4();
            const validRoleId = uuidV4();
            const originalGroup = {
                id: groupId,
                aspects: {
                    "access-group-details": {
                        roleId: validRoleId,
                        permissionId: uuidV4()
                    }
                }
            };
            currentGroupDetails = originalGroup; // Update the mock group details
            // Patch db pool to return a user array for user listing and push queries to executedQueries
            const userRecord = {
                id: userId,
                displayName: "Test User",
                email: "test@example.com",
                photoURL: "",
                source: "test-source",
                sourceId: "test-source-id"
            };
            db.setDbPool({
                query: async (queryOrConfig: any, values?: any[]) => {
                    const query = queryOrConfig.text ?? queryOrConfig;
                    const params = queryOrConfig.values ?? values ?? [];
                    executedQueries.push({ query, params });
                    return {
                        rows: [userRecord]
                    };
                }
            } as any);
            // Act
            const res = await request(app)
                .get(`/v0/auth/accessGroups/${groupId}/users`)
                .send();
            // Assert
            expect(res.status).to.equal(200);
            expect(res.body).to.be.an("array");
            expect(res.body[0]).to.deep.equal(userRecord);
            expect(
                executedQueries.some(
                    (q) =>
                        q.query
                            .toLowerCase()
                            .includes(
                                "SELECT 1 FROM user_roles".toLowerCase()
                            ) && q.params.includes(validRoleId)
                )
            ).to.be.true;
        });
    });

    describe("GET /v0/auth/accessGroups/:groupId/users/count", () => {
        it("should return the count of users in an access group and execute correct SQL", async () => {
            const groupId = uuidV4();
            const validRoleId = uuidV4();
            const originalGroup = {
                id: groupId,
                aspects: {
                    "access-group-details": {
                        roleId: validRoleId,
                        permissionId: uuidV4()
                    }
                }
            };
            currentGroupDetails = originalGroup; // Update the mock group details
            // Patch db pool to return a count object for user count and push queries to executedQueries
            db.setDbPool({
                query: async (queryOrConfig: any, values?: any[]) => {
                    const query = queryOrConfig.text ?? queryOrConfig;
                    const params = queryOrConfig.values ?? values ?? [];
                    executedQueries.push({ query, params });
                    return {
                        rows: [
                            {
                                count: 1
                            }
                        ]
                    };
                }
            } as any);
            // Act
            const res = await request(app)
                .get(`/v0/auth/accessGroups/${groupId}/users/count`)
                .send();
            // Assert
            expect(res.status).to.equal(200);
            expect(res.body).to.have.property("count");
            expect(res.body.count).to.equal(1);
            expect(
                executedQueries.some(
                    (q) =>
                        q.query
                            .toLowerCase()
                            .includes("count(users.*) as count") &&
                        q.query
                            .toLowerCase()
                            .includes(
                                "SELECT 1 FROM user_roles".toLowerCase()
                            ) &&
                        q.params.includes(validRoleId)
                )
            ).to.be.true;
        });
    });
    describe("Agent Skill share groups (#3861)", () => {
        const skillGroupBody = (overrides: any = {}) => ({
            name: "Agent Skill share",
            description: "Managed by Agent Services",
            resourceUri: "object/agentSkill/user",
            keywords: ["agent-skill-share"],
            operationUris: ["object/agentSkill/user/read"],
            ownerId: null as string | null,
            orgUnitId: null as string | null,
            ...overrides
        });

        it("creates only the typed read permission and no control permissions", async () => {
            registryScope
                .post("/records", (body) => {
                    registryRequestBody = body;
                    return true;
                })
                .reply(200, () => ({ id: registryRequestBody.id }));
            const res = await request(app)
                .post("/v0/auth/accessGroups")
                .send(skillGroupBody());
            expect(res.status).to.equal(200);
            expect(createPermissionCalls).to.have.length(1);
            expect(createPermissionCalls[0]).to.include({
                resourceUri: "object/agentSkill/user",
                userOwnershipConstraint: false,
                orgUnitOwnershipConstraint: false,
                preAuthorisedConstraint: true
            });
            expect(createPermissionCalls[0].operationUris).to.deep.equal([
                "object/agentSkill/user/read"
            ]);
            const details = registryRequestBody.aspects["access-group-details"];
            expect(details.resourceUri).to.equal("object/agentSkill/user");
            expect(details.permissionId).to.equal("mock-permission-id-1");
            expect(details.extraControlPermissionIds).to.deep.equal([]);
            const accessControl = registryRequestBody.aspects["access-control"];
            expect(accessControl.ownerId).to.equal(null);
            expect(accessControl.orgUnitId).to.equal(null);
            expect(accessControl.preAuthorisedPermissionIds).to.deep.equal([]);
            const rolePermissions = executedQueries.filter((q) =>
                q.query.toLowerCase().includes("insert into role_permissions")
            );
            expect(rolePermissions).to.have.length(1);
            expect(rolePermissions[0].params).to.deep.equal([
                "mock-role-id",
                "mock-permission-id-1"
            ]);
        });

        it("creates a system skill share group with the typed system read", async () => {
            registryScope
                .post("/records", (body) => {
                    registryRequestBody = body;
                    return true;
                })
                .reply(200, () => ({ id: registryRequestBody.id }));
            const res = await request(app)
                .post("/v0/auth/accessGroups")
                .send(
                    skillGroupBody({
                        resourceUri: "object/agentSkill/system",
                        operationUris: ["object/agentSkill/system/read"]
                    })
                );
            expect(res.status).to.equal(200);
            expect(createPermissionCalls[0].operationUris).to.deep.equal([
                "object/agentSkill/system/read"
            ]);
        });

        silenceErrorLogs(() => {
            for (const operationUris of [
                ["object/record/read"],
                ["object/agentSkill/user/update"],
                [
                    "object/agentSkill/user/read",
                    "object/agentSkill/user/delete"
                ],
                ["object/agentSkill/system/read"],
                []
            ]) {
                it(`rejects a user skill group granting ${JSON.stringify(
                    operationUris
                )}`, async () => {
                    const res = await request(app)
                        .post("/v0/auth/accessGroups")
                        .send(skillGroupBody({ operationUris }));
                    expect(res.status).to.equal(400);
                    expect(createPermissionCalls).to.have.length(0);
                });
            }

            it("rejects an unknown resource URI", async () => {
                const res = await request(app)
                    .post("/v0/auth/accessGroups")
                    .send(
                        skillGroupBody({
                            resourceUri: "object/agentSkill/install",
                            operationUris: ["object/agentSkill/install/read"]
                        })
                    );
                expect(res.status).to.equal(400);
            });

            it("rejects widening a skill group's operations", async () => {
                currentGroupDetails.aspects[
                    "access-group-details"
                ].resourceUri = "object/agentSkill/user";
                currentGroupDetails.aspects[
                    "access-group-details"
                ].operationUris = ["object/agentSkill/user/read"];
                const res = await request(app)
                    .put(`/v0/auth/accessGroups/${currentGroupDetails.id}`)
                    .send({ operationUris: ["object/record/read"] });
                expect(res.status).to.equal(400);
            });

            it("rejects adding a dataset to a skill group", async () => {
                currentGroupDetails.aspects[
                    "access-group-details"
                ].resourceUri = "object/agentSkill/user";
                const res = await request(app)
                    .post(
                        `/v0/auth/accessGroups/${currentGroupDetails.id}/datasets/${datasetRecordMock.id}`
                    )
                    .send();
                expect(res.status).to.equal(400);
            });

            it("rejects adding a user who does not exist", async () => {
                const userId = uuidV4();
                missingRecordIds.add(userId);
                currentGroupDetails.aspects[
                    "access-group-details"
                ].roleId = uuidV4();
                const res = await request(app)
                    .post(
                        `/v0/auth/accessGroups/${currentGroupDetails.id}/users/${userId}`
                    )
                    .send();
                expect(res.status).to.equal(400);
                expect(
                    executedQueries.some((q) =>
                        q.query.toLowerCase().includes("insert into user_roles")
                    )
                ).to.equal(false);
            });
        });
    });

    describe("Typed access group operations (#3910, #3914)", () => {
        function useGroup() {
            currentGroupDetails.id = uuidV4();
            return currentGroupDetails.id as string;
        }

        it("GET /:groupId/users requests object/accessGroup/update", async () => {
            const groupId = useGroup();
            const res = await request(app).get(
                `/v0/auth/accessGroups/${groupId}/users`
            );
            expect(res.status).to.equal(200);
            expect(requestedOperations).to.include("object/accessGroup/update");
            expect(requestedOperations).to.not.include("object/record/read");
        });

        it("GET /:groupId/users/count requests object/accessGroup/update", async () => {
            const groupId = useGroup();
            const res = await request(app).get(
                `/v0/auth/accessGroups/${groupId}/users/count`
            );
            expect(res.status).to.equal(200);
            expect(requestedOperations).to.include("object/accessGroup/update");
        });

        silenceErrorLogs(() => {
            it("returns 403 on the member list for a member who can't update the group", async () => {
                const groupId = useGroup();
                deniedOperations.add("object/accessGroup/update");
                const list = await request(app).get(
                    `/v0/auth/accessGroups/${groupId}/users`
                );
                const count = await request(app).get(
                    `/v0/auth/accessGroups/${groupId}/users/count`
                );
                expect(list.status).to.equal(403);
                expect(count.status).to.equal(403);
            });

            it("returns 403 on PUT, DELETE and add-user for a member", async () => {
                const groupId = useGroup();
                deniedOperations.add("object/accessGroup/update");
                deniedOperations.add("object/accessGroup/delete");
                const put = await request(app)
                    .put(`/v0/auth/accessGroups/${groupId}`)
                    .send({ name: "renamed" });
                const del = await request(app).delete(
                    `/v0/auth/accessGroups/${groupId}`
                );
                const add = await request(app)
                    .post(`/v0/auth/accessGroups/${groupId}/users/${uuidV4()}`)
                    .send();
                expect(put.status).to.equal(403);
                expect(del.status).to.equal(403);
                expect(add.status).to.equal(403);
                expect(
                    executedQueries.some((q) =>
                        q.query.toLowerCase().includes("insert into user_roles")
                    )
                ).to.be.false;
            });

            it("POST /:groupId/users/:userId returns 400 when the stored roleId doesn't hold the group's permissionId", async () => {
                const groupId = useGroup();
                roleMismatch = true;
                const res = await request(app)
                    .post(`/v0/auth/accessGroups/${groupId}/users/${uuidV4()}`)
                    .send();
                expect(res.status).to.equal(400);
                expect(
                    executedQueries.some((q) =>
                        q.query.toLowerCase().includes("insert into user_roles")
                    )
                ).to.be.false;
            });
        });

        it("PUT /:groupId requests object/accessGroup/update", async () => {
            const groupId = useGroup();
            registryScope.patch(/.*/).reply(200, {});
            registryScope.put(/.*/).reply(200, {});
            await request(app)
                .put(`/v0/auth/accessGroups/${groupId}`)
                .send({ name: "renamed" });
            expect(requestedOperations).to.include("object/accessGroup/update");
            expect(requestedOperations).to.not.include("object/record/update");
        });

        it("DELETE /:groupId requests object/accessGroup/delete", async () => {
            const groupId = useGroup();
            registryScope.delete(/.*/).reply(200, { deleted: true });
            await request(app).delete(`/v0/auth/accessGroups/${groupId}`);
            expect(requestedOperations).to.include("object/accessGroup/delete");
            expect(requestedOperations).to.not.include("object/record/delete");
        });

        it("adding and removing users requests object/accessGroup/update", async () => {
            const groupId = useGroup();
            registryScope.put(/.*/).reply(200, {});
            registryScope.put(/.*/).reply(200, {});
            await request(app)
                .post(`/v0/auth/accessGroups/${groupId}/users/${uuidV4()}`)
                .send();
            await request(app)
                .delete(`/v0/auth/accessGroups/${groupId}/users/${uuidV4()}`)
                .send();
            expect(
                requestedOperations.filter(
                    (op) => op === "object/accessGroup/update"
                ).length
            ).to.be.at.least(2);
            expect(requestedOperations).to.not.include("object/record/update");
        });

        it("adding a dataset requests object/accessGroup/update on the group and object/record/update on the dataset", async () => {
            const groupId = useGroup();
            registryScope.put(/.*/).reply(200, {});
            registryScope.put(/.*/).reply(200, {});
            registryScope.put(/.*/).reply(200, {});
            await request(app)
                .post(
                    `/v0/auth/accessGroups/${groupId}/datasets/${datasetRecordMock.id}`
                )
                .send();
            expect(requestedOperations).to.include("object/accessGroup/update");
            expect(requestedOperations).to.include("object/record/update");
        });

        it("POST /v0/auth/accessGroups (record groups) gives the member role the group permission and one pre-authorised object/accessGroup/read", async () => {
            registryScope
                .post("/records", (body) => {
                    registryRequestBody = body;
                    return true;
                })
                .reply(200, () => ({ id: registryRequestBody.id }));
            const res = await request(app)
                .post("/v0/auth/accessGroups")
                .send({
                    name: "A group",
                    description: "",
                    resourceUri: "object/record",
                    keywords: [],
                    operationUris: ["object/record/read"],
                    ownerId: uuidV4(),
                    orgUnitId: null
                });
            expect(res.status).to.equal(200);
            const controls = createPermissionCalls.filter(
                (p) => p.resourceUri === "object/accessGroup"
            );
            expect(controls).to.have.length(1);
            expect(controls[0].resourceUri).to.equal("object/accessGroup");
            expect(controls[0].operationUris).to.deep.equal([
                "object/accessGroup/read"
            ]);
            expect(controls[0].preAuthorisedConstraint).to.equal(true);
            expect(controls[0].userOwnershipConstraint).to.equal(false);
            expect(controls[0].orgUnitOwnershipConstraint).to.equal(false);
            const details = registryRequestBody.aspects["access-group-details"];
            const accessControl = registryRequestBody.aspects["access-control"];
            const controlId = details.extraControlPermissionIds[0];
            expect(details.extraControlPermissionIds).to.deep.equal([
                controlId
            ]);
            expect(accessControl.preAuthorisedPermissionIds).to.include(
                controlId
            );
            // only the group's item permission is on object/record
            expect(
                createPermissionCalls.filter(
                    (p) => p.resourceUri === "object/record"
                )
            ).to.have.length(1);
        });
    });

    describe("Review fixes: create decision, dataset records, grant widening, group integrity", () => {
        function useGroup() {
            currentGroupDetails.id = uuidV4();
            return currentGroupDetails.id as string;
        }
        function distribution(id: string) {
            extraRecords[id] = {
                id,
                name: id,
                aspects: {
                    "dcat-distribution-strings": { title: id },
                    "access-control": { ownerId: "someone-else" }
                }
            };
        }

        it("POST / makes the create decision on the validated group, with ownerId defaulted to the caller", async () => {
            const callerId = uuidV4();
            registryScope
                .post("/records", (body) => {
                    registryRequestBody = body;
                    return true;
                })
                .reply(200, () => ({ id: registryRequestBody.id }));
            const res = await request(app)
                .post("/v0/auth/accessGroups")
                .set("X-Magda-Session", buildJwt(argv.jwtSecret, callerId))
                .send({
                    name: "A group",
                    resourceUri: "object/record",
                    keywords: ["a", "a"],
                    operationUris: ["object/record/read"]
                });
            expect(res.status).to.equal(200);
            const create = decisionConfigs.find(
                (c) => c.operationUri === "object/accessGroup/create"
            );
            expect(create.input.object.accessGroup.ownerId).to.equal(callerId);
            expect(create.input.object.accessGroup.keywords).to.deep.equal([
                "a"
            ]);
            expect(create.input.object.accessGroup.resourceUri).to.equal(
                "object/record"
            );
        });

        silenceErrorLogs(() => {
            it("POST / validates before the create decision", async () => {
                const res = await request(app)
                    .post("/v0/auth/accessGroups")
                    .send({ resourceUri: "object/record" });
                expect(res.status).to.equal(400);
                expect(requestedOperations).to.not.include(
                    "object/accessGroup/create"
                );
            });

            it("adding a dataset returns 403 and writes nothing when a listed distribution can't be updated", async () => {
                const groupId = useGroup();
                distribution("dist-1");
                distribution("dist-2");
                deniedRecordIds.add("dist-2");
                let written = false;
                registryScope.put(/.*/).reply(200, () => {
                    written = true;
                    return {};
                });
                const res = await request(app)
                    .post(
                        `/v0/auth/accessGroups/${groupId}/datasets/${datasetRecordMock.id}`
                    )
                    .send();
                expect(res.status).to.equal(403);
                expect(written).to.be.false;
            });

            it("adding a dataset returns 400 when a listed distribution doesn't exist", async () => {
                const groupId = useGroup();
                distribution("dist-1");
                const res = await request(app)
                    .post(
                        `/v0/auth/accessGroups/${groupId}/datasets/${datasetRecordMock.id}`
                    )
                    .send();
                expect(res.status).to.equal(400);
            });

            it("removing a dataset returns 403 when a listed distribution can't be updated", async () => {
                const groupId = useGroup();
                distribution("dist-1");
                distribution("dist-2");
                deniedRecordIds.add("dist-1");
                const res = await request(app)
                    .delete(
                        `/v0/auth/accessGroups/${groupId}/datasets/${datasetRecordMock.id}`
                    )
                    .send();
                expect(res.status).to.equal(403);
            });

            it("PUT returns 403 when a manager without an unconstrained grant widens operationUris", async () => {
                const groupId = useGroup();
                notUnconstrained = true;
                const res = await request(app)
                    .put(`/v0/auth/accessGroups/${groupId}`)
                    .send({
                        operationUris: [
                            "object/record/read",
                            "object/record/delete"
                        ]
                    });
                expect(res.status).to.equal(403);
            });

            it("PUT returns 403 when a manager without an unconstrained grant sets an Agent Skill share keyword", async () => {
                const groupId = useGroup();
                notUnconstrained = true;
                const res = await request(app)
                    .put(`/v0/auth/accessGroups/${groupId}`)
                    .send({ keywords: ["agent-skill-share-0123abcd"] });
                expect(res.status).to.equal(403);
            });

            it("remove-user returns 400 when the stored role isn't the group's member role", async () => {
                const groupId = useGroup();
                roleMismatch = true;
                const res = await request(app)
                    .delete(
                        `/v0/auth/accessGroups/${groupId}/users/${uuidV4()}`
                    )
                    .send();
                expect(res.status).to.equal(400);
                expect(
                    executedQueries.some((q) =>
                        q.query.toLowerCase().includes("delete from user_roles")
                    )
                ).to.be.false;
            });

            it("delete-group returns 400 when the stored role isn't the group's member role", async () => {
                const groupId = useGroup();
                roleMismatch = true;
                const res = await request(app).delete(
                    `/v0/auth/accessGroups/${groupId}`
                );
                expect(res.status).to.equal(400);
            });

            it("delete-group returns 400 when a control permission isn't the group's own", async () => {
                const groupId = useGroup();
                controlMismatch = true;
                const res = await request(app).delete(
                    `/v0/auth/accessGroups/${groupId}`
                );
                expect(res.status).to.equal(400);
            });
        });

        it("PUT allows narrowing operationUris without an unconstrained grant", async () => {
            const groupId = useGroup();
            notUnconstrained = true;
            registryScope.put(/.*/).reply(200, {});
            registryScope.put(/.*/).reply(200, {});
            const res = await request(app)
                .put(`/v0/auth/accessGroups/${groupId}`)
                .send({ operationUris: ["object/record/read"] });
            expect(res.status).to.not.equal(403);
        });
    });
});

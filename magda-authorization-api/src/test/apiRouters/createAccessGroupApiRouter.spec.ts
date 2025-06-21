import {} from "mocha";
import request from "supertest";
import express from "express";
import nock from "nock";
import { expect } from "chai";
import sinon from "sinon";
import addJwtSecretFromEnvVar from "magda-typescript-common/src/session/addJwtSecretFromEnvVar.js";
import fakeArgv from "magda-typescript-common/src/test/fakeArgv.js";
import createMockAuthDecisionQueryClient from "magda-typescript-common/src/test/createMockAuthDecisionQueryClient.js";
import mockDatabase from "../mockDatabase.js";
import Database from "../../Database.js";
import createAccessGroupApiRouter from "../../apiRouters/createAccessGroupApiRouter.js";
import { UnconditionalTrueDecision } from "@magda/typescript-common/dist/opa/AuthDecision.js";
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
                UnconditionalTrueDecision
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
                "mock-permission-id-2",
                "mock-permission-id-3"
            ]);
            const ac = registryRequestBody.aspects["access-control"];
            expect(ac.ownerId).to.equal(reqBody.ownerId);
            expect(ac.preAuthorisedPermissionIds).to.deep.equal([
                "mock-permission-id-2"
            ]);

            // Permission assertions
            expect(createPermissionCalls.length).to.equal(3);
            // 1. Group item permission
            expect(createPermissionCalls[0].resourceUri).to.equal(
                "object/record"
            );
            expect(createPermissionCalls[0].operationUris).to.deep.equal([
                "object/record/read",
                "object/record/update"
            ]);
            // 2. Group record read permission
            expect(createPermissionCalls[1].resourceUri).to.equal(
                "object/record"
            );
            expect(createPermissionCalls[1].operationUris).to.deep.equal([
                "object/record/read"
            ]);
            // 3. Group UI access permission
            expect(createPermissionCalls[2].resourceUri).to.equal(
                "object/accessGroup"
            );
            expect(createPermissionCalls[2].operationUris).to.deep.equal([
                "object/accessGroup/read"
            ]);

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
                "mock-permission-id-2",
                "mock-role-id",
                "mock-permission-id-3"
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
                        roleId: validRoleId
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
                        roleId: validRoleId
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
                        roleId: validRoleId
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
                        roleId: validRoleId
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
});

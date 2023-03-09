import {} from "mocha";
import sinon from "sinon";
import request from "supertest";
import express from "express";
import addJwtSecretFromEnvVar from "magda-typescript-common/src/session/addJwtSecretFromEnvVar";
import { MAGDA_ADMIN_PORTAL_ID } from "magda-typescript-common/src/registry/TenantConsts";
import buildJwt from "magda-typescript-common/src/session/buildJwt";
import fakeArgv from "magda-typescript-common/src/test/fakeArgv";
import createApiRouter from "../createApiRouter";
import { expect } from "chai";
import jsc from "magda-typescript-common/src/test/jsverify";
import mockDatabase from "./mockDatabase";
import mockUserDataStore from "magda-typescript-common/src/test/mockUserDataStore";
import Database from "../Database";
import { userDataArb } from "./arbitraries";
import {
    uuidArb,
    lcAlphaNumStringArbNe
} from "magda-typescript-common/src/test/arbitraries";
import { Request } from "supertest";
import mockApiKeyStore from "./mockApiKeyStore";
import AuthorizedRegistryClient from "magda-typescript-common/src/registry/AuthorizedRegistryClient";
import { DEFAULT_ADMIN_USER_ID } from "magda-typescript-common/src/authorization-api/constants";
import AuthDecision, {
    UnconditionalTrueDecision,
    UnconditionalFalseDecision
} from "magda-typescript-common/src/opa/AuthDecision";
import createMockAuthDecisionQueryClient from "magda-typescript-common/src/test/createMockAuthDecisionQueryClient";
import { AuthDecisionReqConfig } from "magda-typescript-common/src/opa/AuthDecisionQueryClient";

describe("Auth api router", function (this: Mocha.ISuiteCallbackContext) {
    this.timeout(10000);

    let argv: any;

    before(function () {
        argv = retrieveArgv();
    });

    afterEach(function () {
        mockUserDataStore.reset();
        mockApiKeyStore.reset();
    });

    function retrieveArgv() {
        const argv = addJwtSecretFromEnvVar(
            fakeArgv({
                listenPort: 6014,
                dbHost: "localhost",
                dbPort: 5432,
                jwtSecret: "squirrel",
                userId: DEFAULT_ADMIN_USER_ID
            })
        );
        return argv;
    }

    function buildExpressApp(
        authDecisionOrOperationUri:
            | AuthDecision
            | string = UnconditionalTrueDecision
    ) {
        const apiRouter = createApiRouter({
            jwtSecret: argv.jwtSecret,
            database: new mockDatabase() as Database,
            opaUrl: process.env["OPA_URL"]
                ? process.env["OPA_URL"]
                : "http://localhost:8181/",
            tenantId: MAGDA_ADMIN_PORTAL_ID,
            authDecisionClient: createMockAuthDecisionQueryClient(
                typeof authDecisionOrOperationUri === "string"
                    ? async (
                          config: AuthDecisionReqConfig,
                          jwtToken?: string
                      ) =>
                          config?.operationUri === authDecisionOrOperationUri
                              ? UnconditionalTrueDecision
                              : UnconditionalFalseDecision
                    : authDecisionOrOperationUri
            ),
            registryClient: new AuthorizedRegistryClient({
                baseUrl: "http://localhost:6101/v0",
                jwtSecret: argv.jwtSecret as string,
                userId: argv.userId,
                tenantId: MAGDA_ADMIN_PORTAL_ID,
                maxRetries: 0
            }),
            failedApiKeyAuthBackOffSeconds: 5
        });

        const app = express();
        app.use(require("body-parser").json({ limit: "100mb" }));
        app.use(apiRouter);

        return app;
    }

    function silenceErrorLogs(inner: () => void) {
        describe("(with silent console.error or console.warn)", () => {
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

    function setMockRequestSession(req: Request, userId: string) {
        return req.set("X-Magda-Session", buildJwt(argv.jwtSecret, userId));
    }

    describe("POST /private/users", () => {
        silenceErrorLogs(() => {
            it("should create a new user if called with correct permission", async () => {
                const app = buildExpressApp("authObject/user/create");

                await jsc.assert(
                    jsc.forall(userDataArb, async (userData) => {
                        try {
                            mockUserDataStore.reset();

                            const req = request(app)
                                .post("/private/users")
                                .send(userData);

                            const res = await req.then((res) => res);
                            expect(res.status).to.equal(200);
                            expect(res.body).to.be.a("object");
                            expect(res.body.id).to.be.a("string");

                            const newUserId: string = res.body.id;
                            expect(res.body).to.deep.equal({
                                ...userData,
                                id: res.body.id
                            });

                            const users = mockUserDataStore.getRecordByUserId(
                                newUserId
                            );
                            expect(users).to.be.an("array").that.is.not.empty;
                            expect(users[0]).to.deep.include(userData);

                            return true;
                        } catch (e) {
                            throw e;
                        }
                    })
                );
            });

            it("should return 403 status code without creating a new user if called as a standard user", async () => {
                const currentMockUserStoreSize = mockUserDataStore.countRecord();
                const app = buildExpressApp(
                    "authObject/user/never-matched-operation"
                );

                await jsc.assert(
                    jsc.forall(userDataArb, async (userData) => {
                        try {
                            mockUserDataStore.reset();
                            const req = request(app)
                                .post("/private/users")
                                .send(userData);

                            const res = await req.then((res) => res);

                            expect(res.status).to.equal(403);
                            expect(mockUserDataStore.countRecord()).to.equal(
                                currentMockUserStoreSize
                            );

                            return true;
                        } catch (e) {
                            throw e;
                        }
                    })
                );
            });
        });
    });

    describe("GET /private/users/lookup", () => {
        silenceErrorLogs(() => {
            it("should return 403 status code if requested as a standard user", async () => {
                const app = buildExpressApp(
                    "authObject/user/never-matched-operation"
                );

                await jsc.assert(
                    jsc.forall(userDataArb, async (userData) => {
                        try {
                            mockUserDataStore.reset();
                            mockUserDataStore.createRecord(userData);

                            const { source, sourceId } = userData;
                            const req = request(app)
                                .get("/private/users/lookup")
                                .query({
                                    source,
                                    sourceId
                                });
                            const res = await req.then((res) => res);

                            expect(res.status).to.equal(403);

                            return true;
                        } catch (e) {
                            throw e;
                        }
                    })
                );
            });

            it("should return correct user data if queried by `source` & `sourceID` and requested as an admin user", async () => {
                const app = buildExpressApp("authObject/user/read");

                await jsc.assert(
                    jsc.forall(userDataArb, async (userData) => {
                        try {
                            mockUserDataStore.reset();
                            mockUserDataStore.createRecord(userData);

                            const { source, sourceId } = userData;
                            const req = request(app)
                                .get("/private/users/lookup")
                                .query({
                                    source,
                                    sourceId
                                });

                            const res = await req.then((res) => res);
                            expect(res.status).to.equal(200);
                            expect(res.body).to.be.a("object");
                            expect(res.body.id).to.be.a("string");
                            expect(res.body).to.deep.include(userData);

                            return true;
                        } catch (e) {
                            throw e;
                        }
                    })
                );
            });
        });
    });

    describe("GET /private/users/:userId", () => {
        silenceErrorLogs(() => {
            it("should return 403 status code if requested as a standard user", async () => {
                const app = buildExpressApp(
                    "authObject/user/never-matched-operation"
                );

                await jsc.assert(
                    jsc.forall(userDataArb, async (userData) => {
                        try {
                            mockUserDataStore.reset();
                            const {
                                id: userId
                            } = mockUserDataStore.createRecord(userData);

                            const req = request(app).get(
                                `/private/users/${userId}`
                            );
                            const res = await req.then((res) => res);

                            expect(res.status).to.equal(403);

                            return true;
                        } catch (e) {
                            throw e;
                        }
                    })
                );
            });

            it("should return correct user data if queried by `userId` and requested as an admin user", async () => {
                const app = buildExpressApp("authObject/user/read");

                await jsc.assert(
                    jsc.forall(userDataArb, async (userData) => {
                        try {
                            mockUserDataStore.reset();
                            const {
                                id: userId
                            } = mockUserDataStore.createRecord(userData);

                            const req = request(app).get(
                                `/private/users/${userId}`
                            );

                            const res = await req.then((res) => res);
                            expect(res.status).to.equal(200);
                            expect(res.body).to.be.a("object");
                            expect(res.body.id).to.be.a("string");
                            expect({ id: userId, ...userData }).to.deep.include(
                                res.body
                            );

                            return true;
                        } catch (e) {
                            throw e;
                        }
                    })
                );
            });
        });
    });

    describe("GET /private/users/apikey/:apiKeyId", () => {
        silenceErrorLogs(() => {
            it("should return correct user data with correct API key & API Key Id", async () => {
                // api key verification doesn't require any permission
                const app = buildExpressApp(
                    "authObject/user/never-matched-operation"
                );
                await jsc.assert(
                    jsc.forall(
                        uuidArb,
                        userDataArb,
                        async (apiKey, userData) => {
                            try {
                                mockUserDataStore.reset();
                                const {
                                    id: userId
                                } = mockUserDataStore.createRecord(userData);

                                mockApiKeyStore.reset();
                                const {
                                    id: apiKeyId
                                } = await mockApiKeyStore.create(
                                    userId,
                                    apiKey
                                );

                                const res = await request(app)
                                    .get(`/private/users/apikey/${apiKeyId}`)
                                    .set("X-Magda-API-Key", apiKey);

                                expect(res.status).to.equal(200);
                                expect(res.body).to.be.a("object");
                                expect(res.body.id).to.be.a("string");
                                expect({
                                    id: userId,
                                    ...userData
                                }).to.deep.include(res.body);

                                return true;
                            } catch (e) {
                                throw e;
                            }
                        }
                    ),
                    // --- we need to limit the no. of test here as bcrypt hash is very slow
                    { tests: 5 }
                );
            });

            it("should deny access with incorrect API key & API Key Id", async () => {
                const app = buildExpressApp(
                    "authObject/user/never-matched-operation"
                );
                await jsc.assert(
                    jsc.forall(
                        uuidArb,
                        lcAlphaNumStringArbNe,
                        userDataArb,
                        async (apiKey, randomStr, userData) => {
                            try {
                                mockUserDataStore.reset();
                                const {
                                    id: userId
                                } = mockUserDataStore.createRecord(userData);

                                mockApiKeyStore.reset();
                                const {
                                    id: apiKeyId
                                } = await mockApiKeyStore.create(
                                    userId,
                                    apiKey
                                );

                                const res = await request(app)
                                    .get(`/private/users/apikey/${apiKeyId}`)
                                    // --- add non empty random string to make it incorrect key
                                    .set("X-Magda-API-Key", apiKey + randomStr);

                                expect(res.status).to.equal(401);

                                return true;
                            } catch (e) {
                                throw e;
                            }
                        }
                    ),
                    // --- we need to limit the no. of test here as bcrypt hash is very slow
                    { tests: 5 }
                );
            });
        });
    });

    describe("GET /public/users/:userId", () => {
        silenceErrorLogs(() => {
            it("should return correct user data if queried by `userId` without sepecifying user ID", async () => {
                const app = buildExpressApp();
                await jsc.assert(
                    jsc.forall(userDataArb, async (userData) => {
                        try {
                            mockUserDataStore.reset();
                            const {
                                id: userId
                            } = mockUserDataStore.createRecord(userData);

                            const req = request(app).get(
                                `/public/users/${userId}`
                            );

                            const res = await req.then((res) => res);

                            expect(res.status).to.equal(200);
                            expect(res.body).to.be.a("object");
                            expect(res.body.id).to.be.a("string");
                            expect({ id: userId, ...userData }).to.deep.include(
                                res.body
                            );

                            return true;
                        } catch (e) {
                            throw e;
                        }
                    })
                );
            });

            it("should return correct user data if queried by `userId` and requested as a standard user", async () => {
                const standardUserId = mockUserDataStore.getRecordByIndex(1).id;
                const app = buildExpressApp();
                await jsc.assert(
                    jsc.forall(userDataArb, async (userData) => {
                        try {
                            mockUserDataStore.reset();
                            const {
                                id: userId
                            } = mockUserDataStore.createRecord(userData);

                            const req = request(app).get(
                                `/public/users/${userId}`
                            );
                            setMockRequestSession(req, standardUserId);
                            const res = await req.then((res) => res);

                            expect(res.status).to.equal(200);
                            expect(res.body).to.be.a("object");
                            expect(res.body.id).to.be.a("string");
                            expect({ id: userId, ...userData }).to.deep.include(
                                res.body
                            );

                            return true;
                        } catch (e) {
                            throw e;
                        }
                    })
                );
            });

            it("should return correct user data if queried by `userId` and requested as an admin user", async () => {
                const adminUserId = mockUserDataStore.getRecordByIndex(0).id;
                const app = buildExpressApp();
                await jsc.assert(
                    jsc.forall(userDataArb, async (userData) => {
                        try {
                            mockUserDataStore.reset();
                            const {
                                id: userId
                            } = mockUserDataStore.createRecord(userData);

                            const req = request(app).get(
                                `/public/users/${userId}`
                            );

                            setMockRequestSession(req, adminUserId);

                            const res = await req.then((res) => res);
                            expect(res.status).to.equal(200);
                            expect(res.body).to.be.a("object");
                            expect(res.body.id).to.be.a("string");
                            expect({ id: userId, ...userData }).to.deep.include(
                                res.body
                            );

                            return true;
                        } catch (e) {
                            throw e;
                        }
                    })
                );
            });
        });
    });

    describe("GET /public/users/whoami", () => {
        silenceErrorLogs(() => {
            it("should return 200 status code without including session header", async () => {
                const app = buildExpressApp();
                await jsc.assert(
                    jsc.forall(jsc.nat, async () => {
                        try {
                            mockUserDataStore.reset();
                            const req = request(app).get(
                                "/public/users/whoami"
                            );

                            const res = await req.then((res) => res);

                            expect(res.status).to.equal(200);

                            return true;
                        } catch (e) {
                            throw e;
                        }
                    })
                );
            });

            it("should return correct user data specified by session header", async () => {
                const app = buildExpressApp();
                await jsc.assert(
                    jsc.forall(userDataArb, async (userData) => {
                        try {
                            mockUserDataStore.reset();
                            const {
                                id: userId
                            } = mockUserDataStore.createRecord(userData);

                            const req = request(app).get(
                                `/public/users/whoami`
                            );
                            setMockRequestSession(req, userId);
                            const res = await req.then((res) => res);

                            expect(res.status).to.equal(200);
                            expect(res.body).to.be.a("object");
                            expect(res.body.id).to.be.a("string");

                            const {
                                roles,
                                permissions,
                                managingOrgUnitIds,
                                orgUnit,
                                orgUnitId,
                                ...bodyUserData
                            } = res.body;

                            expect(res.body.roles).to.be.a("array");
                            expect(res.body.permissions).to.be.a("array");
                            expect({ id: userId, ...userData }).to.deep.include(
                                bodyUserData
                            );

                            return true;
                        } catch (e) {
                            throw e;
                        }
                    })
                );
            });
        });
    });
});

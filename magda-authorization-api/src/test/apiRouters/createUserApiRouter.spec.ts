import {} from "mocha";
import request from "supertest";
import { v4 as uuidv4 } from "uuid";
import nock from "nock";
import express from "express";
import addJwtSecretFromEnvVar from "magda-typescript-common/src/session/addJwtSecretFromEnvVar.js";
import createMockAuthDecisionQueryClient from "magda-typescript-common/src/test/createMockAuthDecisionQueryClient.js";
import fakeArgv from "magda-typescript-common/src/test/fakeArgv.js";
import createUserApiRouter from "../../apiRouters/createUserApiRouter.js";
import { expect } from "chai";
import mockDatabase from "../mockDatabase.js";
import mockUserDataStore from "magda-typescript-common/src/test/mockUserDataStore.js";
import Database from "../../Database.js";
import { UnconditionalTrueDecision } from "@magda/typescript-common/dist/opa/AuthDecision.js";
import { Pool } from "pg";

describe("User api router", function (this) {
    this.timeout(5000);

    let app: express.Express;
    let argv: any;
    const mockDb = new mockDatabase();

    before(function () {
        nock.disableNetConnect();
        nock.enableNetConnect("127.0.0.1");
        argv = retrieveArgv();
        app = buildExpressApp();
    });

    afterEach(function () {
        mockDb.resetDbPool();
        mockUserDataStore.reset();
        nock.cleanAll();
    });

    after(() => {
        nock.cleanAll();
        nock.enableNetConnect();
    });

    function retrieveArgv() {
        const argv = addJwtSecretFromEnvVar(
            fakeArgv({
                listenPort: 6014,
                dbHost: "localhost",
                dbPort: 5432,
                jwtSecret: "squirrel"
            })
        );
        return argv;
    }

    function buildExpressApp() {
        const apiRouter = createUserApiRouter({
            jwtSecret: argv.jwtSecret,
            database: (mockDb as unknown) as Database,
            authDecisionClient: createMockAuthDecisionQueryClient(
                UnconditionalTrueDecision
            )
        });

        const app = express();
        app.use(apiRouter);

        return app;
    }

    describe("DELETE user by ID", () => {
        it("should correct call deleteUser to delete user", async () => {
            mockUserDataStore.reset();
            const user = mockUserDataStore.createRecord({
                displayName: "test user",
                email: "",
                photoURL: "",
                source: "source_1",
                sourceId: "source_id_1"
            });

            const user2 = mockUserDataStore.createRecord({
                displayName: "test user2",
                email: "",
                photoURL: "",
                source: "source_1",
                sourceId: "source_id_1"
            });

            mockDb.setDbPool({
                query: async (query: string, params: any[]) => {
                    // mock the auth query for requireObjectPermission auth middleware
                    if (
                        query.toLowerCase() !==
                        'select * from "users" where id = $1 limit 1'
                    ) {
                        throw new Error("Unexpected query");
                    }
                    const userId = params[0];
                    if (![user.id, user2.id].includes(userId)) {
                        return {
                            rows: [] as any[]
                        };
                    } else if (userId === user.id) {
                        return {
                            rows: [user]
                        };
                    } else {
                        return {
                            rows: [user2]
                        };
                    }
                }
            } as Pool);

            expect(mockUserDataStore.countRecord()).to.be.equal(4);
            // why 4? because we have 2 built-in records in the mockUserDataStore
            expect(mockUserDataStore.getRecordByIndex(2).id).to.be.equal(
                user.id
            );
            expect(mockUserDataStore.getRecordByIndex(3).id).to.be.equal(
                user2.id
            );

            await request(app)
                .delete(`/sdssfsfdsfsd`)
                .then((res) => {
                    // invalid user id will return 400 status code
                    expect(res.status).to.be.equal(400);
                    // no user should be deleted
                    expect(mockUserDataStore.countRecord()).to.be.equal(4);
                    expect(
                        mockUserDataStore.getRecordByIndex(2).id
                    ).to.be.equal(user.id);
                    expect(
                        mockUserDataStore.getRecordByIndex(3).id
                    ).to.be.equal(user2.id);
                });

            await request(app)
                .delete(`/${uuidv4()}`)
                .then((res) => {
                    // non-existing user id will return 200 status code (rather than 404) as nothing to delete
                    expect(res.status).to.be.equal(200);
                    // no user should be deleted
                    expect(mockUserDataStore.countRecord()).to.be.equal(4);
                    expect(
                        mockUserDataStore.getRecordByIndex(2).id
                    ).to.be.equal(user.id);
                    expect(
                        mockUserDataStore.getRecordByIndex(3).id
                    ).to.be.equal(user2.id);
                });

            await request(app)
                .delete(`/${user.id}`)
                .then((res) => {
                    // correct user id should be deleted
                    expect(res.status).to.be.equal(200);
                    expect(mockUserDataStore.countRecord()).to.be.equal(3);
                    expect(
                        mockUserDataStore.getRecordByIndex(2).id
                    ).to.be.equal(user2.id);
                });
        });
    });
});

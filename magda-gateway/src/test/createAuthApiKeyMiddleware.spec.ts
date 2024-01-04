import {} from "mocha";
import sinon from "sinon";
import pg from "pg";
import express from "express";
import nock from "nock";
import supertest from "supertest";
import buildApp from "../buildApp.js";
import { AuthPluginBasicConfig } from "../createAuthPluginRouter.js";
import getTestDBConfig from "magda-typescript-common/src/test/db/getTestDBConfig.js";
import runMigrationSql, {
    deleteAllTables
} from "magda-typescript-common/src/test/db/runMigrationSql.js";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { expect } from "chai";
import jwt from "jsonwebtoken";
import { getCurrentDirPath } from "@magda/esm-utils";

const __dirname = getCurrentDirPath();

const dbConfig = getTestDBConfig();
const defaultAppOptions = {
    listenPort: 80,
    externalUrl: "http://127.0.0.1",
    dbHost: dbConfig.host,
    dbPort: 5432,
    authDBHost: dbConfig.host,
    authDBPort: 5432,
    proxyRoutesJson: {
        registry: {
            to: "http://registry",
            auth: true,
            methods: [
                {
                    method: "get",
                    target: "http://registry-api-read-only/v0"
                },
                {
                    method: "options",
                    target: "http://registry-api-read-only/v0"
                },
                {
                    method: "head",
                    target: "http://registry-api-read-only/v0"
                },
                {
                    method: "post",
                    target: "http://registry-api/v0"
                },
                {
                    method: "put",
                    target: "http://registry-api/v0"
                },
                {
                    method: "delete",
                    target: "http://registry-api/v0"
                }
            ]
        }
    },
    webProxyRoutesJson: {
        "preview-map": "http://preview-map",
        map: "http://map",
        other: "http://otherplace"
    },
    cookieJson: {},
    helmetJson: {},
    cspJson: {},
    corsJson: {},
    authorizationApi: "http://auth-api",
    sessionSecret: "secret",
    jwtSecret: "jwtSecret",
    userId: "b1fddd6f-e230-4068-bd2c-1a21844f1598",
    web: "https://127.0.0.1",
    tenantUrl: "http://tenant",
    defaultCacheControl: "DEFAULT CACHE CONTROL",
    authPluginConfigJson: [] as AuthPluginBasicConfig[],
    registryQueryCacheStdTTL: 600,
    registryQueryCacheMaxKeys: 500
};

function getUserIdFromNockReq(req: any, jwtSecret: string) {
    const jwtToken = req.headers["X-Magda-Session".toLowerCase()];
    if (jwtToken) {
        const jwtPayload = jwt.verify(jwtToken, jwtSecret);
        return jwtPayload.userId;
    } else {
        throw new Error("Cannot locate JWT token header: X-Magda-Session");
    }
}

describe("createAuthApiKeyMiddleware", () => {
    let pool: pg.Pool = null;

    before(async () => {
        // --- you have to supply a db name to connect to pg
        pool = new pg.Pool({ ...dbConfig });
        try {
            await pool.query("CREATE database test");
        } catch (e) {
            // --- if database `test` already there
            // --- then mute the error
            if ((e as any)?.code !== "42P04") {
                throw e;
            }
        }
        // --- end the current one & create a new one
        await pool.end();
        pool = new pg.Pool({ ...dbConfig, database: "test" });
        // --- rebuilt the schema
        await runMigrationSql(
            pool,
            path.resolve(__dirname, "../../../magda-migrator-session-db/sql"),
            true
        );
    });

    after(async function () {
        nock.cleanAll();
        if (pool) {
            await deleteAllTables(pool);
            pool.end();
            pool = null;
        }
    });

    beforeEach(async () => {
        // -- clear up session table
        await pool.query("DELETE FROM session");
    });

    afterEach(() => {
        if ((<sinon.SinonStub>console.error).restore) {
            (<sinon.SinonStub>console.error).restore();
        }
    });

    it("should request auth api for verifying API key correctly (GET Request)", async () => {
        const apiKeyId = uuidv4();
        const apiKey = "API_KEY_" + Math.random();
        const userId = uuidv4();
        const testMsg = "TEST_MSG_" + Math.random();

        let app;
        app = express();
        app = buildApp(app, defaultAppOptions);

        nock("http://registry-api-read-only")
            .get("/v0/records")
            .reply(function (this: any, uri, body) {
                const reqUserId = getUserIdFromNockReq(
                    this.req,
                    defaultAppOptions.jwtSecret
                );
                expect(reqUserId).to.equal(userId);
                return [200, { msg: testMsg }];
            });

        nock("http://auth-api")
            .get("/private/users/apikey/" + apiKeyId)
            .reply(function (this: any, uri, body) {
                const curApiKeyHeader = this.req.headers[
                    "X-Magda-API-Key".toLowerCase()
                ];
                const curApiKey = curApiKeyHeader?.length
                    ? curApiKeyHeader[0]
                    : curApiKeyHeader;

                expect(curApiKey).to.equal(apiKey);

                return [200, { id: userId }];
            });

        const res = await supertest(app)
            .get("/api/v0/registry/records")
            .set("X-Magda-API-Key-Id", apiKeyId)
            .set("X-Magda-API-Key", apiKey)
            .expect(200);

        expect(res.body.msg).to.equal(testMsg);
    });

    it("should request auth api for verifying API key correctly (POST Request)", async () => {
        const apiKeyId = uuidv4();
        const apiKey = "API_KEY_" + Math.random();
        const userId = uuidv4();
        const testMsg = "TEST_MSG_" + Math.random();

        let app;
        app = express();
        app = buildApp(app, defaultAppOptions);

        nock("http://registry-api")
            .post("/v0/records")
            .reply(function (this: any, uri, body) {
                const reqUserId = getUserIdFromNockReq(
                    this.req,
                    defaultAppOptions.jwtSecret
                );
                expect(reqUserId).to.equal(userId);
                return [200, { msg: testMsg }];
            });

        nock("http://auth-api")
            .get("/private/users/apikey/" + apiKeyId)
            .reply(function (this: any, uri, body) {
                const curApiKeyHeader = this.req.headers[
                    "X-Magda-API-Key".toLowerCase()
                ];
                const curApiKey = curApiKeyHeader?.length
                    ? curApiKeyHeader[0]
                    : curApiKeyHeader;

                expect(curApiKey).to.equal(apiKey);

                return [200, { id: userId }];
            });

        const res = await supertest(app)
            .post("/api/v0/registry/records")
            .set("X-Magda-API-Key-Id", apiKeyId)
            .set("X-Magda-API-Key", apiKey)
            .expect(200);

        expect(res.body.msg).to.equal(testMsg);
    });

    it("should request auth api for verifying API key (as bearer token) correctly (GET Request)", async () => {
        const apiKeyId = uuidv4();
        const apiKey = "API_KEY_" + Math.random();
        const userId = uuidv4();
        const testMsg = "TEST_MSG_" + Math.random();

        let app;
        app = express();
        app = buildApp(app, defaultAppOptions);

        nock("http://registry-api-read-only")
            .get("/v0/records")
            .times(3)
            .reply(function (this: any, uri, body) {
                const reqUserId = getUserIdFromNockReq(
                    this.req,
                    defaultAppOptions.jwtSecret
                );
                expect(reqUserId).to.equal(userId);
                return [200, { msg: testMsg }];
            });

        nock("http://auth-api")
            .get("/private/users/apikey/" + apiKeyId)
            .times(3)
            .reply(function (this: any, uri, body) {
                const curApiKeyHeader = this.req.headers[
                    "X-Magda-API-Key".toLowerCase()
                ];
                const curApiKey = curApiKeyHeader?.length
                    ? curApiKeyHeader[0]
                    : curApiKeyHeader;

                expect(curApiKey).to.equal(apiKey);

                return [200, { id: userId }];
            });

        let res = await supertest(app)
            .get("/api/v0/registry/records")
            .set("Authorization", `Bearer ${apiKeyId}:${apiKey}`)
            .expect(200);

        expect(res.body.msg).to.equal(testMsg);

        // testing lowercase bearer
        res = await supertest(app)
            .get("/api/v0/registry/records")
            .set("Authorization", `bearer ${apiKeyId}:${apiKey}`)
            .expect(200);

        expect(res.body.msg).to.equal(testMsg);

        // testing lowercase authorization
        res = await supertest(app)
            .get("/api/v0/registry/records")
            .set("authorization", `bearer ${apiKeyId}:${apiKey}`)
            .expect(200);

        expect(res.body.msg).to.equal(testMsg);
    });

    it("should request auth api for verifying API key (as bearer token) correctly (POST Request)", async () => {
        const apiKeyId = uuidv4();
        const apiKey = "API_KEY_" + Math.random();
        const userId = uuidv4();
        const testMsg = "TEST_MSG_" + Math.random();

        let app;
        app = express();
        app = buildApp(app, defaultAppOptions);

        nock("http://registry-api")
            .post("/v0/records")
            .times(3)
            .reply(function (this: any, uri, body) {
                const reqUserId = getUserIdFromNockReq(
                    this.req,
                    defaultAppOptions.jwtSecret
                );
                expect(reqUserId).to.equal(userId);
                return [200, { msg: testMsg }];
            });

        nock("http://auth-api")
            .get("/private/users/apikey/" + apiKeyId)
            .times(3)
            .reply(function (this: any, uri, body) {
                const curApiKeyHeader = this.req.headers[
                    "X-Magda-API-Key".toLowerCase()
                ];
                const curApiKey = curApiKeyHeader?.length
                    ? curApiKeyHeader[0]
                    : curApiKeyHeader;

                expect(curApiKey).to.equal(apiKey);

                return [200, { id: userId }];
            });

        let res = await supertest(app)
            .post("/api/v0/registry/records")
            .set("Authorization", `Bearer ${apiKeyId}:${apiKey}`)
            .expect(200);

        expect(res.body.msg).to.equal(testMsg);

        // testing lowercase bearer
        res = await supertest(app)
            .post("/api/v0/registry/records")
            .set("Authorization", `bearer ${apiKeyId}:${apiKey}`)
            .expect(200);

        expect(res.body.msg).to.equal(testMsg);

        // testing lowercase authorization
        res = await supertest(app)
            .post("/api/v0/registry/records")
            .set("authorization", `bearer ${apiKeyId}:${apiKey}`)
            .expect(200);

        expect(res.body.msg).to.equal(testMsg);
    });
});

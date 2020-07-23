import {} from "mocha";
import pg from "pg";
import path from "path";
import express from "express";
import getTestDBConfig from "magda-typescript-common/src/test/db/getTestDBConfig";
import runMigrationSql, {
    deleteAllTables
} from "magda-typescript-common/src/test/db/runMigrationSql";
import nock from "nock";
import { UserToken } from "magda-typescript-common/src/authorization-api/model";
import { getUserId } from "magda-typescript-common/src/session/GetUserId";
import buildApp, { Config as BuildAppConfig } from "../buildApp";
import defaultAppConfig from "../defaultConfig";
import { v4 as uuidv4 } from "uuid";
import supertest from "supertest";
import { expect } from "chai";
import partial from "lodash/partial";

const SESSION_SECRET = "test-session-secret";
const JWT_SECRET = uuidv4();
const TEST_METHODS = <const>["post", "get", "put", "delete"];

/**
 * get header value in case insensitive way to prevent error
 *
 * @param {*} req
 * @param {string} headerName
 * @returns
 */
function getHeaderValue(req: any, headerName: string) {
    headerName = headerName.toLowerCase();
    const headerKeys = Object.keys(req.headers);
    for (let i = 0; i < headerKeys.length; i++) {
        if (headerKeys[i].toLowerCase() === headerName) {
            const header = req.headers[headerKeys[i]];
            if (typeof header !== "string" && header?.length) {
                return header[0];
            } else {
                return header;
            }
        }
    }
    return undefined;
}

function createBasicAuthHeader(username: string, password: string) {
    return (
        "Basic " +
        new Buffer(`${username}:${password}`, "utf-8").toString("base64")
    );
}

describe("Integration Tests", function (this: Mocha.ISuiteCallbackContext) {
    this.timeout(30000);
    let pool: pg.Pool = null;
    const dbConfig = getTestDBConfig();
    const authApiBaseUrl = "http://auth-api.example.com";
    let authApiScope: nock.Scope;

    const mockApiKeyId = "5e73cfcc-a098-4b89-855f-ac4da5a12fa1";
    const mockApiKey = "Y29ycmVjdCBhcGkga2V5";
    const mockApiUserToken: UserToken = {
        id: "cf53e442-b741-4a45-baa0-902e55dbc59d"
    };

    function setUpMockAuthApi() {
        authApiScope = nock(authApiBaseUrl);
        authApiScope
            .persist()
            .get(/\/private\/getUserByApiKey\/[^/]+/)
            .reply(function (this: any, uri, requestBody, cb) {
                const parts = uri.split("/");
                if (parts.length < 3) {
                    cb(null, [400, "Bad Request"]);
                    return;
                }
                const apiKeyId = parts[parts.length - 1];
                const apiKey = getHeaderValue(this.req, "X-Magda-API-Key");
                if (apiKeyId !== mockApiKeyId || apiKey !== mockApiKey) {
                    cb(null, [401, "Unauthorized"]);
                    return;
                } else {
                    cb(null, [201, { ...mockApiUserToken }]);
                    return;
                }
            });
    }

    function setupTestApp(config: Partial<BuildAppConfig> = {}) {
        const app = express();
        buildApp(app, {
            listenPort: 80,
            externalUrl: "http://localhost:80",
            dbHost: dbConfig.host,
            dbPort: 5432,
            enableInternalAuthProvider: false,
            // --- internal auth has been turned off so provide dummy authDBHost here shouldn't matter
            authDBHost: dbConfig.host,
            authDBPort: 5432,
            proxyRoutesJson: defaultAppConfig.proxyRoutes,
            webProxyRoutesJson: undefined,
            helmetJson: defaultAppConfig.helmet,
            cspJson: defaultAppConfig.csp,
            corsJson: defaultAppConfig.cors,
            cookieJson: {
                sameSite: "lax"
            },
            authorizationApi: authApiBaseUrl,
            sessionSecret: SESSION_SECRET,
            jwtSecret: JWT_SECRET,
            userId: "00000000-0000-4000-8000-000000000000",
            web: "http://localhost:6108",
            previewMap: "http://localhost:6110",
            enableHttpsRedirection: false,
            enableWebAccessControl: false,
            enableAuthEndpoint: true,
            ckanUrl: "https://demo.ckan.org/",
            enableCkanRedirection: false,
            ckanRedirectionDomain: "redirect-ckan.exmaple.com",
            ckanRedirectionPath: "",
            fetchTenantsMinIntervalInMs: 60000,
            tenantUrl: "http://localhost:6130/v0",
            enableMultiTenants: false,
            defaultCacheControl: "public, max-age=60",
            openfaasGatewayUrl: undefined,
            ...config
        });

        return supertest(app);
    }

    before(async () => {
        // --- you have to supply a db name to connect to pg
        pool = new pg.Pool({ ...dbConfig });
        try {
            await pool.query("CREATE database test");
        } catch (e) {
            // --- if database `test` already there
            // --- then mute the error
            if (e.code !== "42P04") {
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
        setUpMockAuthApi();
    });

    afterEach(() => {
        nock.cleanAll();
    });

    describe("Test API key authentication", () => {
        const dummyApiBaseUrl = "http://dummy-api-endpoint.example.com";

        async function testAllMethod(
            request: supertest.SuperTest<supertest.Test>,
            headers: { [key: string]: string },
            expectedStatusCode: number = 200
        ) {
            // --- store `userId` to each of http method key
            const testResult: {
                [key in typeof TEST_METHODS[number]]?: string;
            } = {};

            for (let i = 0; i < TEST_METHODS.length; i++) {
                const scope = nock(dummyApiBaseUrl);

                const method = TEST_METHODS[i];
                (scope as any)
                    [method](/.*/)
                    .reply(function (
                        this: any,
                        uri: string,
                        requestBody: string
                    ) {
                        this.req.header = partial(getHeaderValue, this.req);
                        testResult[method] = getUserId(
                            this.req,
                            JWT_SECRET
                        ).valueOr("");
                        return [200, "OK"];
                    });

                let req = request[method]("/api/v0/dummy-api-endpoint/xxx");

                if (Object.keys(headers).length) {
                    Object.keys(headers).forEach(
                        (key) => (req = req.set(key, headers[key]))
                    );
                }

                req.expect(expectedStatusCode);

                await req;
            }

            return testResult;
        }

        it("Shoud forward req to API routes with correct X-Magda-Session header", async () => {
            const request = setupTestApp({
                proxyRoutesJson: {
                    "dummy-api-endpoint": {
                        to: dummyApiBaseUrl,
                        auth: true,
                        statusCheck: false
                    }
                },
                enableWebAccessControl: false
            });

            const result = await testAllMethod(
                request,
                {
                    "X-Magda-API-Key": mockApiKey,
                    "X-Magda-API-Key-Id": mockApiKeyId
                },
                200
            );

            TEST_METHODS.forEach((method) => {
                expect(result[method]).to.equal(mockApiUserToken.id);
            });
        });

        it("Shoud response 401 with incorrect X-Magda-API-Key", async () => {
            const request = setupTestApp({
                proxyRoutesJson: {
                    "dummy-api-endpoint": {
                        to: dummyApiBaseUrl,
                        auth: true,
                        statusCheck: false
                    }
                },
                enableWebAccessControl: false
            });

            const result = await testAllMethod(
                request,
                {
                    "X-Magda-API-Key": mockApiKey + "make it incorrect",
                    "X-Magda-API-Key-Id": mockApiKeyId
                },
                401
            );

            TEST_METHODS.forEach((method) => {
                expect(result[method]).to.be.undefined;
            });
        });

        it("Shoud forward req to API routes with correct X-Magda-Session header when basic auth is on", async () => {
            const webAccessUsername = "test-magda-user";
            const webAccessPassword = "test-magda-user 123";

            const request = setupTestApp({
                proxyRoutesJson: {
                    "dummy-api-endpoint": {
                        to: dummyApiBaseUrl,
                        auth: true,
                        statusCheck: false
                    }
                },
                enableWebAccessControl: true,
                webAccessUsername,
                webAccessPassword
            });

            const result = await testAllMethod(
                request,
                {
                    "X-Magda-API-Key": mockApiKey,
                    "X-Magda-API-Key-Id": mockApiKeyId,
                    Authorization: createBasicAuthHeader(
                        webAccessUsername,
                        webAccessPassword
                    )
                },
                200
            );

            TEST_METHODS.forEach((method) => {
                expect(result[method]).to.equal(mockApiUserToken.id);
            });
        });

        it("Shoud response 401 with incorrect basic auth details when basic auth is on", async () => {
            const webAccessUsername = "test-magda-user";
            const webAccessPassword = "test-magda-user 123";

            const request = setupTestApp({
                proxyRoutesJson: {
                    "dummy-api-endpoint": {
                        to: dummyApiBaseUrl,
                        auth: true,
                        statusCheck: false
                    }
                },
                enableWebAccessControl: true,
                webAccessUsername,
                webAccessPassword
            });

            const result = await testAllMethod(
                request,
                {
                    "X-Magda-API-Key": mockApiKey,
                    "X-Magda-API-Key-Id": mockApiKeyId,
                    Authorization: createBasicAuthHeader(
                        webAccessUsername,
                        webAccessPassword + "to make it incorrect"
                    )
                },
                401
            );

            TEST_METHODS.forEach((method) => {
                expect(result[method]).to.be.undefined;
            });
        });

        it("Shoud response 401 with incorrect X-Magda-API-Key when basic auth is on and correct basic auth header is provided", async () => {
            const webAccessUsername = "test-magda-user";
            const webAccessPassword = "test-magda-user 123";

            const request = setupTestApp({
                proxyRoutesJson: {
                    "dummy-api-endpoint": {
                        to: dummyApiBaseUrl,
                        auth: true,
                        statusCheck: false
                    }
                },
                enableWebAccessControl: true,
                webAccessUsername,
                webAccessPassword
            });

            const result = await testAllMethod(
                request,
                {
                    "X-Magda-API-Key": mockApiKey + "make it incorrect",
                    "X-Magda-API-Key-Id": mockApiKeyId,
                    Authorization: createBasicAuthHeader(
                        webAccessUsername,
                        webAccessPassword
                    )
                },
                401
            );

            TEST_METHODS.forEach((method) => {
                expect(result[method]).to.be.undefined;
            });
        });
    });
});

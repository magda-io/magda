import {} from "mocha";
import * as pg from "pg";
import * as path from "path";
import * as express from "express";
import * as signature from "cookie-signature";
import { expect } from "chai";
import * as cookie from "cookie";
import * as _ from "lodash";
import * as supertest from "supertest";
import Authenticator, { DEFAULT_SESSION_COOKIE_NAME } from "../Authenticator";
import getTestDBConfig from "@magda/typescript-common/dist/test/db/getTestDBConfig";
import runMigrationSql, {
    deleteAllTables
} from "@magda/typescript-common/dist/test/db/runMigrationSql";

const SESSION_SECRET = "test-session-secret";

/**
More info of test cases behaviour see:
https://github.com/magda-io/magda/issues/2545
**/

describe("Test Authenticator (Session Management)", function(this: Mocha.ISuiteCallbackContext) {
    this.timeout(10000);
    let pool: pg.Pool = null;
    const dbConfig = getTestDBConfig();
    let isNextHandlerCalled = false;

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

    after(async function() {
        if (pool) {
            await deleteAllTables(pool);
            pool.end();
            pool = null;
        }
    });

    function setupTest() {
        const app: express.Application = express();
        const auth = new Authenticator({
            dbPool: pool,
            sessionSecret: SESSION_SECRET
        });

        // --- attach auth routes to test app
        auth.applyToRoute(app);

        app.use((req, res) => {
            // --- we should always check if middleware stuck
            isNextHandlerCalled = true;
            res.send("OK");
        });

        return supertest(app);
    }

    /**
     * Get Cookie from set Cookie Response header
     * Will return an array:
     * - the first element is cookie data
     * - the second element is the cookie options
     * If not found will return [null, null]
     *
     * @param {{ [key: string]: any }} header
     * @param {string} cookieName
     * @returns {[string, { [key: string]: any }]}
     */
    function getSetCookie(
        header: { [key: string]: any },
        cookieName: string
    ): [string, { [key: string]: any }] {
        if (
            !header["set-cookie"] ||
            !_.isArray(header["set-cookie"]) ||
            !header["set-cookie"].length
        ) {
            return [null, null];
        }
        for (let i = 0; i < header["set-cookie"].length; i++) {
            const data = cookie.parse(header["set-cookie"][i]);
            if (data[cookieName]) {
                let cookieData: string | boolean = data[cookieName];
                if (cookieData.substr(0, 2) === "s:") {
                    // --- signed
                    cookieData = signature.unsign(
                        cookieData.slice(2),
                        SESSION_SECRET
                    );
                    if (cookieData === false)
                        throw new Error(
                            "Failed to decode cookie: cookie signature invalid"
                        );
                }
                delete data[cookieName];
                return [cookieData, { ...data }];
            }
            continue;
        }
        return [null, null];
    }

    function createCookieData(
        name: string,
        data: string,
        secret: string,
        options: {}
    ): string {
        const signed = "s:" + signature.sign(data, secret);
        return cookie.serialize(name, signed, options);
    }

    async function getStoreSessionById(sessionId: string) {
        const result = await pool.query(
            `SELECT * FROM "session" WHERE "sid" = $1`,
            [sessionId]
        );
        if (!_.isArray(result.rows) || !result.rows.length) {
            return null;
        }
        return result.rows[0];
    }

    beforeEach(() => {
        isNextHandlerCalled = false;
    });

    describe("Test path /auth/login/*", () => {
        it("Shoud start session if it has not started", async () => {
            const request = setupTest();

            await request
                .post(
                    "/auth/login/xxxxxx?redirect=https%3A%2F%2Fdev.magda.io%2Fsign-in-redirect%3FredirectTo%3D%2Faccount"
                )
                .expect(200)
                .then(async res => {
                    expect(isNextHandlerCalled).to.equal(true);
                    const [sessionId] = getSetCookie(
                        res.header,
                        DEFAULT_SESSION_COOKIE_NAME
                    );
                    expect(sessionId).not.to.be.null;
                    const storeSession = await getStoreSessionById(sessionId);
                    expect(storeSession).not.to.be.null;
                    expect(storeSession.sid).to.equal(sessionId);
                });
        });

        it("Shoud NOT start a new session for the next request (that carries cookie) to /auth/login/*", async () => {
            const request = setupTest();
            let sessionId: string = null;
            let cookieOptions = {};

            await request
                .post(
                    "/auth/login/xxxxxx?redirect=https%3A%2F%2Fdev.magda.io%2Fsign-in-redirect%3FredirectTo%3D%2Faccount"
                )
                .expect(200)
                .then(async res => {
                    expect(isNextHandlerCalled).to.equal(true);
                    [sessionId, cookieOptions] = getSetCookie(
                        res.header,
                        DEFAULT_SESSION_COOKIE_NAME
                    );
                    expect(sessionId).not.to.be.null;
                    const storeSession = await getStoreSessionById(sessionId);
                    expect(storeSession).not.to.be.null;
                    expect(storeSession.sid).to.equal(sessionId);
                });

            await request
                .get("/auth/login/another-request")
                .set("Cookie", [
                    createCookieData(
                        DEFAULT_SESSION_COOKIE_NAME,
                        sessionId,
                        SESSION_SECRET,
                        cookieOptions
                    )
                ])
                .expect(200)
                .then(async res => {
                    expect(isNextHandlerCalled).to.equal(true);
                    const [sessionId2] = getSetCookie(
                        res.header,
                        DEFAULT_SESSION_COOKIE_NAME
                    );
                    expect(sessionId2).not.to.be.null;
                    expect(sessionId2).to.equal(sessionId);
                });
        });

        it("Shoud NOT start a new session for the next request (that carries cookie) to /xxxxx", async () => {
            const request = setupTest();
            let sessionId: string = null;
            let cookieOptions = {};

            await request
                .post(
                    "/auth/login/xxxxxx?redirect=https%3A%2F%2Fdev.magda.io%2Fsign-in-redirect%3FredirectTo%3D%2Faccount"
                )
                .expect(200)
                .then(async res => {
                    expect(isNextHandlerCalled).to.equal(true);
                    [sessionId, cookieOptions] = getSetCookie(
                        res.header,
                        DEFAULT_SESSION_COOKIE_NAME
                    );
                    expect(sessionId).not.to.be.null;
                    const storeSession = await getStoreSessionById(sessionId);
                    expect(storeSession).not.to.be.null;
                    expect(storeSession.sid).to.equal(sessionId);
                });

            await request
                .get("/xxxxx")
                .set("Cookie", [
                    createCookieData(
                        DEFAULT_SESSION_COOKIE_NAME,
                        sessionId,
                        SESSION_SECRET,
                        cookieOptions
                    )
                ])
                .expect(200)
                .then(async res => {
                    expect(isNextHandlerCalled).to.equal(true);
                    const [sessionId2] = getSetCookie(
                        res.header,
                        DEFAULT_SESSION_COOKIE_NAME
                    );
                    expect(sessionId2).not.to.be.null;
                    expect(sessionId2).to.equal(sessionId);
                });
        });
    });

    describe("Test path /xxxxx (Non /auth/login/* Path)", () => {
        it("Shoud not create any cookie if the session has not started yet", async () => {
            const request = setupTest();

            await request
                .post("/xxxxx")
                .expect(200)
                .then(async res => {
                    expect(isNextHandlerCalled).to.equal(true);
                    expect(res.header["set-cookie"]).to.be.undefined;
                });

            await request
                .get("/xxxxx")
                .expect(200)
                .then(async res => {
                    expect(isNextHandlerCalled).to.equal(true);
                    expect(res.header["set-cookie"]).to.be.undefined;
                });
        });

        it("Shoud NOT start a new session incoming request carries session cookie", async () => {
            const request = setupTest();
            let sessionId: string = null;
            let cookieOptions = {};

            // --- access a `/auth/login/*` route to create the session
            await request
                .get("/auth/login/xxxxxx")
                .expect(200)
                .then(async res => {
                    expect(isNextHandlerCalled).to.equal(true);
                    [sessionId, cookieOptions] = getSetCookie(
                        res.header,
                        DEFAULT_SESSION_COOKIE_NAME
                    );
                    expect(sessionId).not.to.be.null;
                    const storeSession = await getStoreSessionById(sessionId);
                    expect(storeSession).not.to.be.null;
                    expect(storeSession.sid).to.equal(sessionId);
                });

            // --- access /xxxxx with session id created by previous request
            await request
                .get("/xxxxx")
                .set("Cookie", [
                    createCookieData(
                        DEFAULT_SESSION_COOKIE_NAME,
                        sessionId,
                        SESSION_SECRET,
                        cookieOptions
                    )
                ])
                .expect(200)
                .then(async res => {
                    expect(isNextHandlerCalled).to.equal(true);
                    const [sessionId2] = getSetCookie(
                        res.header,
                        DEFAULT_SESSION_COOKIE_NAME
                    );
                    expect(sessionId2).not.to.be.null;
                    expect(sessionId2).to.equal(sessionId);
                });
        });
    });

    /*
    describe("`X-Forwarded-Proto` header is http", () => {
        it("should forward request to next request handler if `enableHttpsRedirection` parameter is false", () => {
            const testRequest = setupTest(false, "http");

            return testRequest.expect(200).then(() => {
                expect(isNextHandlerCalled).to.equal(true);
            });
        });

        it("should redirect to the same URL with HTTPS protocol if `enableHttpsRedirection` parameter is true", () => {
            const testRequest = setupTest(true, "http");

            return testRequest
                .expect(301)
                .expect(function(res: supertest.Response) {
                    expect(isNextHandlerCalled).to.equal(false);
                    const location = res.header.location;
                    const uri = new URI(location);
                    expect(uri.protocol()).to.equal("https");
                    expect(uri.host()).to.equal(testHost);
                    expect(uri.pathname()).to.equal(urlPath);
                    expect(uri.search(true)).to.deep.equal(urlQuery);
                });
        });
    });

    describe("`X-Forwarded-Proto` header is https", () => {
        it("should forward request to next request handler if `enableHttpsRedirection` parameter is false", () => {
            const testRequest = setupTest(false, "https");

            return testRequest.expect(200).then(() => {
                expect(isNextHandlerCalled).to.equal(true);
            });
        });

        it("should forward request to next request handler if `enableHttpsRedirection` parameter is true", () => {
            const testRequest = setupTest(true, "https");

            return testRequest.expect(200).then(() => {
                expect(isNextHandlerCalled).to.equal(true);
            });
        });
    });

    describe("`X-Forwarded-Proto` header is not set", () => {
        it("should forward request to next request handler if `enableHttpsRedirection` parameter is false", () => {
            const testRequest = setupTest(false, null);

            return testRequest.expect(200).then(() => {
                expect(isNextHandlerCalled).to.equal(true);
            });
        });

        it("should forward request to next request handler if `enableHttpsRedirection` parameter is true", () => {
            const testRequest = setupTest(true, "https");

            return testRequest.expect(200).then(() => {
                expect(isNextHandlerCalled).to.equal(true);
            });
        });
    });*/
});

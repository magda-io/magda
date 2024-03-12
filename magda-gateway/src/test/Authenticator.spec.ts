import {} from "mocha";
import pg from "pg";
import path from "path";
import express, { NextFunction } from "express";
import signature from "cookie-signature";
import { expect } from "chai";
import cookie from "cookie";
import _ from "lodash";
import supertest from "supertest";
import randomstring from "randomstring";
import Authenticator from "../Authenticator.js";
import {
    DEFAULT_SESSION_COOKIE_NAME,
    DEFAULT_SESSION_COOKIE_OPTIONS
} from "magda-typescript-common/src/session/cookieUtils.js";
import getTestDBConfig from "magda-typescript-common/src/test/db/getTestDBConfig.js";
import runMigrationSql, {
    deleteAllTables
} from "magda-typescript-common/src/test/db/runMigrationSql.js";
import { getCurrentDirPath } from "@magda/esm-utils";

const __dirname = getCurrentDirPath();

type PlainObject = { [key: string]: string };

const SESSION_SECRET = "test-session-secret";

/**
More info of test cases behaviour see:
https://github.com/magda-io/magda/issues/2545
**/

describe("Test Authenticator (Session Management)", function (this) {
    this.timeout(30000);
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
        if (pool) {
            await deleteAllTables(pool);
            pool.end();
            pool = null;
        }
    });

    beforeEach(async () => {
        isNextHandlerCalled = false;
        // -- clear up session table
        await pool.query("DELETE FROM session");
    });

    function setupTest(
        cookieOptions: any = {},
        extraMiddleware: (
            req: Express.Request,
            res: Express.Response,
            next: NextFunction
        ) => void = null
    ) {
        const app: express.Application = express();
        const auth = new Authenticator({
            dbPool: pool,
            sessionSecret: SESSION_SECRET,
            cookieOptions,
            externalUrl: "http://test-magda.com/",
            authApiBaseUrl: "http://test-auth-api.com"
        });

        // --- attach auth routes to test app
        auth.applyToRoute(app);

        if (extraMiddleware) {
            app.use(extraMiddleware);
        }

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
     * @param {PlainObject} header
     * @param {string} cookieName
     * @returns {[string, PlainObject]}
     */
    function getSetCookie(
        header: PlainObject,
        cookieName: string
    ): [string, PlainObject] {
        if (
            !header["set-cookie"] ||
            !_.isArray(header["set-cookie"]) ||
            !header["set-cookie"].length
        ) {
            return [null, null];
        }
        for (let i = 0; i < header["set-cookie"].length; i++) {
            const data = cookie.parse(header["set-cookie"][i]);
            if (typeof data[cookieName] !== "undefined") {
                let cookieData: string | boolean = data[cookieName];
                if (cookieData.substring(0, 2) === "s:") {
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

    async function getTotalStoreSessionNum() {
        const result = await pool.query(
            `SELECT COUNT(*) AS count FROM "session"`
        );
        if (!_.isArray(result.rows) || !result.rows.length) {
            return 0;
        }
        if (!result.rows[0]["count"]) return 0;
        try {
            const count = parseInt(result.rows[0]["count"]);
            if (isNaN(count)) return 0;
            else return count;
        } catch (e) {
            return 0;
        }
    }

    function wait(time: number = 0) {
        time = time ? time : 1;
        return new Promise((resolve, reject) => {
            setTimeout(resolve, time);
        });
    }

    describe("Test path /auth/login/*", () => {
        it("Shoud start session if it has not started", async () => {
            const request = setupTest();

            await request
                .post(
                    "/auth/login/xxxxxx?redirect=https%3A%2F%2Fdev.magda.io%2Fsign-in-redirect%3FredirectTo%3D%2Faccount"
                )
                .expect(200)
                .then(async (res) => {
                    expect(isNextHandlerCalled).to.equal(true);
                    const [sessionId] = getSetCookie(
                        res.header,
                        DEFAULT_SESSION_COOKIE_NAME
                    );
                    expect(sessionId).not.to.be.null;
                    const storeSession = await getStoreSessionById(sessionId);
                    expect(storeSession).not.to.be.null;
                    expect(storeSession.sid).to.equal(sessionId);
                    expect(await getTotalStoreSessionNum()).to.equal(1);
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
                .then(async (res) => {
                    expect(isNextHandlerCalled).to.equal(true);
                    // reset isNextHandlerCalled: always check our middleware is not stuck
                    isNextHandlerCalled = false;
                    [sessionId, cookieOptions] = getSetCookie(
                        res.header,
                        DEFAULT_SESSION_COOKIE_NAME
                    );
                    expect(sessionId).not.to.be.null;
                    const storeSession = await getStoreSessionById(sessionId);
                    expect(storeSession).not.to.be.null;
                    expect(storeSession.sid).to.equal(sessionId);
                    expect(await getTotalStoreSessionNum()).to.equal(1);
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
                .then(async (res) => {
                    expect(isNextHandlerCalled).to.equal(true);
                    const [sessionId2] = getSetCookie(
                        res.header,
                        DEFAULT_SESSION_COOKIE_NAME
                    );
                    expect(sessionId2).not.to.be.null;
                    expect(sessionId2).to.equal(sessionId);
                    expect(await getTotalStoreSessionNum()).to.equal(1);
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
                .then(async (res) => {
                    expect(isNextHandlerCalled).to.equal(true);
                    isNextHandlerCalled = false;
                    [sessionId, cookieOptions] = getSetCookie(
                        res.header,
                        DEFAULT_SESSION_COOKIE_NAME
                    );
                    expect(sessionId).not.to.be.null;
                    const storeSession = await getStoreSessionById(sessionId);
                    expect(storeSession).not.to.be.null;
                    expect(storeSession.sid).to.equal(sessionId);
                    expect(await getTotalStoreSessionNum()).to.equal(1);
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
                .then(async (res) => {
                    expect(isNextHandlerCalled).to.equal(true);
                    const [sessionId2] = getSetCookie(
                        res.header,
                        DEFAULT_SESSION_COOKIE_NAME
                    );
                    expect(sessionId2).not.to.be.null;
                    expect(sessionId2).to.equal(sessionId);
                    expect(await getTotalStoreSessionNum()).to.equal(1);
                });
        });
    });

    describe("Test path /auth/logout", () => {
        it("Should destroy the existing session and delete the sessios cookie", async () => {
            const request = setupTest();
            let sessionId: string = null;
            let cookieOptions: PlainObject = {};

            // --- visit /auth/login to create a session first
            await request
                .post("/auth/login/xxxxxx")
                .expect(200)
                .then(async (res) => {
                    expect(isNextHandlerCalled).to.equal(true);
                    isNextHandlerCalled = false;
                    [sessionId, cookieOptions] = getSetCookie(
                        res.header,
                        DEFAULT_SESSION_COOKIE_NAME
                    );
                    expect(sessionId).not.to.be.null;
                    const storeSession = await getStoreSessionById(sessionId);
                    expect(storeSession).not.to.be.null;
                    expect(storeSession.sid).to.equal(sessionId);
                    expect(await getTotalStoreSessionNum()).to.equal(1);
                });

            await request
                .get("/auth/logout")
                .set("Cookie", [
                    createCookieData(
                        DEFAULT_SESSION_COOKIE_NAME,
                        sessionId,
                        SESSION_SECRET,
                        cookieOptions
                    )
                ])
                .expect(200)
                .then(async (res) => {
                    expect(isNextHandlerCalled).to.equal(false);
                    expect(res.body.isError).to.equal(false);
                    [sessionId, cookieOptions] = getSetCookie(
                        res.header,
                        DEFAULT_SESSION_COOKIE_NAME
                    );
                    expect(sessionId).to.equal("");
                    expect(cookieOptions.Expires).to.equal(
                        "Thu, 01 Jan 1970 00:00:00 GMT"
                    );
                    // --- give session store a chance to run before checking
                    await wait(500);
                    // --- existing session also destroyed in store
                    expect(await getTotalStoreSessionNum()).to.equal(0);
                });
        });

        it("Should destroy the existing session, delete the sessios cookie and redirect the user when redirect query param presents", async () => {
            const request = setupTest();
            let sessionId: string = null;
            let cookieOptions: PlainObject = {};

            // --- visit /auth/login to create a session first
            await request
                .post("/auth/login/xxxxxx")
                .expect(200)
                .then(async (res) => {
                    expect(isNextHandlerCalled).to.equal(true);
                    isNextHandlerCalled = false;
                    [sessionId, cookieOptions] = getSetCookie(
                        res.header,
                        DEFAULT_SESSION_COOKIE_NAME
                    );
                    expect(sessionId).not.to.be.null;
                    const storeSession = await getStoreSessionById(sessionId);
                    expect(storeSession).not.to.be.null;
                    expect(storeSession.sid).to.equal(sessionId);
                    expect(await getTotalStoreSessionNum()).to.equal(1);
                });

            await request
                .get("/auth/logout?redirect=%2Flogout-landing")
                .set("Cookie", [
                    createCookieData(
                        DEFAULT_SESSION_COOKIE_NAME,
                        sessionId,
                        SESSION_SECRET,
                        cookieOptions
                    )
                ])
                .expect((res) => {
                    expect(res.status).to.equals(302);
                    // when a relative URL is provided, system will auto add magda's externalUrl (global.externalUrl) to it
                    expect(res?.header?.["location"]).to.equals(
                        "http://test-magda.com/logout-landing"
                    );
                })
                .then(async (res) => {
                    expect(isNextHandlerCalled).to.equal(false);
                    [sessionId, cookieOptions] = getSetCookie(
                        res.header,
                        DEFAULT_SESSION_COOKIE_NAME
                    );
                    expect(sessionId).to.equal("");
                    expect(cookieOptions.Expires).to.equal(
                        "Thu, 01 Jan 1970 00:00:00 GMT"
                    );
                    // --- give session store a chance to run before checking
                    await wait(500);
                    // --- existing session also destroyed in store
                    expect(await getTotalStoreSessionNum()).to.equal(0);
                });
        });

        it("Should not set cookie header in response if request does not carry session cookie", async () => {
            const request = setupTest();

            await request
                .get("/auth/logout")
                .expect(200)
                .then(async (res) => {
                    expect(isNextHandlerCalled).to.equal(false);
                    const [sessionId, cookieOptions] = getSetCookie(
                        res.header,
                        DEFAULT_SESSION_COOKIE_NAME
                    );
                    expect(sessionId).to.be.null;
                    expect(cookieOptions).to.be.null;
                    expect(await getTotalStoreSessionNum()).to.equal(0);
                });
        });

        it("Should simply terminate Magda session without forwarding logout request even when plugin register the logoutUrl in session but redirect query param is not provided", async () => {
            const request = setupTest({}, (req, res, next) => {
                // set middleware to simulate authPlugin's setting session data
                // see https://github.com/magda-io/magda/blob/master/docs/docs/authentication-plugin-spec.md
                req.session.authPlugin = {
                    key: "my-auth-plugin",
                    logoutUrl: "/auth/login/plugin/my-auth-plugin/logout"
                };
                next();
            });
            let sessionId: string = null;
            let cookieOptions: PlainObject = {};

            // --- visit /auth/login to create a session first
            await request
                .post("/auth/login/xxxxxx")
                .expect(200)
                .then(async (res) => {
                    expect(isNextHandlerCalled).to.equal(true);
                    isNextHandlerCalled = false;
                    [sessionId, cookieOptions] = getSetCookie(
                        res.header,
                        DEFAULT_SESSION_COOKIE_NAME
                    );
                    expect(sessionId).not.to.be.null;
                    const storeSession = await getStoreSessionById(sessionId);
                    expect(storeSession?.sess?.authPlugin?.logoutUrl).to.equal(
                        "/auth/login/plugin/my-auth-plugin/logout"
                    );
                    expect(storeSession).not.to.be.null;
                    expect(storeSession.sid).to.equal(sessionId);
                    expect(await getTotalStoreSessionNum()).to.equal(1);
                });

            await request
                .get("/auth/logout")
                .set("Cookie", [
                    createCookieData(
                        DEFAULT_SESSION_COOKIE_NAME,
                        sessionId,
                        SESSION_SECRET,
                        cookieOptions
                    )
                ])
                .expect(200)
                .then(async (res) => {
                    expect(isNextHandlerCalled).to.equal(false);
                    expect(res.body.isError).to.equal(false);
                    [sessionId, cookieOptions] = getSetCookie(
                        res.header,
                        DEFAULT_SESSION_COOKIE_NAME
                    );
                    expect(sessionId).to.equal("");
                    expect(cookieOptions.Expires).to.equal(
                        "Thu, 01 Jan 1970 00:00:00 GMT"
                    );
                    // --- give session store a chance to run before checking
                    await wait(500);
                    // --- existing session also destroyed in store
                    expect(await getTotalStoreSessionNum()).to.equal(0);
                });
        });

        it("Should simply terminate Magda session without forwarding logout request even when plugin register the logoutUrl in session but redirect query param is not provided (store authPlugin info in passport session)", async () => {
            const request = setupTest({}, (req, res, next) => {
                // set middleware to simulate authPlugin's setting session data
                // see https://github.com/magda-io/magda/blob/master/docs/docs/authentication-plugin-spec.md
                req.login(
                    {
                        id: "my-user-id",
                        authPlugin: {
                            key: "my-auth-plugin",
                            logoutUrl:
                                "/auth/login/plugin/my-auth-plugin/logout"
                        }
                    },
                    next
                );
            });
            let sessionId: string = null;
            let cookieOptions: PlainObject = {};

            // --- visit /auth/login to create a session first
            await request
                .post("/auth/login/xxxxxx")
                .expect(200)
                .then(async (res) => {
                    expect(isNextHandlerCalled).to.equal(true);
                    isNextHandlerCalled = false;
                    [sessionId, cookieOptions] = getSetCookie(
                        res.header,
                        DEFAULT_SESSION_COOKIE_NAME
                    );
                    expect(sessionId).not.to.be.null;
                    const storeSession = await getStoreSessionById(sessionId);
                    expect(
                        storeSession?.sess?.passport?.user?.authPlugin
                            ?.logoutUrl
                    ).to.equal("/auth/login/plugin/my-auth-plugin/logout");
                    expect(storeSession).not.to.be.null;
                    expect(storeSession.sid).to.equal(sessionId);
                    expect(await getTotalStoreSessionNum()).to.equal(1);
                });

            await request
                .get("/auth/logout")
                .set("Cookie", [
                    createCookieData(
                        DEFAULT_SESSION_COOKIE_NAME,
                        sessionId,
                        SESSION_SECRET,
                        cookieOptions
                    )
                ])
                .expect(200)
                .then(async (res) => {
                    expect(isNextHandlerCalled).to.equal(false);
                    expect(res.body.isError).to.equal(false);
                    [sessionId, cookieOptions] = getSetCookie(
                        res.header,
                        DEFAULT_SESSION_COOKIE_NAME
                    );
                    expect(sessionId).to.equal("");
                    expect(cookieOptions.Expires).to.equal(
                        "Thu, 01 Jan 1970 00:00:00 GMT"
                    );
                    // --- give session store a chance to run before checking
                    await wait(500);
                    // --- existing session also destroyed in store
                    expect(await getTotalStoreSessionNum()).to.equal(0);
                });
        });

        it("Should forward logout request when plugin register the logoutUrl in session and redirect query param is provided", async () => {
            const request = setupTest({}, (req, res, next) => {
                // set middleware to simulate authPlugin's setting session data
                // see https://github.com/magda-io/magda/blob/master/docs/docs/authentication-plugin-spec.md
                req.session.authPlugin = {
                    key: "my-auth-plugin",
                    logoutUrl: "/auth/login/plugin/my-auth-plugin/logout"
                };
                next();
            });
            let sessionId: string = null;
            let cookieOptions: PlainObject = {};

            // --- visit /auth/login to create a session first
            await request
                .post("/auth/login/xxxxxx")
                .expect(200)
                .then(async (res) => {
                    expect(isNextHandlerCalled).to.equal(true);
                    isNextHandlerCalled = false;
                    [sessionId, cookieOptions] = getSetCookie(
                        res.header,
                        DEFAULT_SESSION_COOKIE_NAME
                    );
                    expect(sessionId).not.to.be.null;
                    const storeSession = await getStoreSessionById(sessionId);
                    expect(storeSession?.sess?.authPlugin?.logoutUrl).to.equal(
                        "/auth/login/plugin/my-auth-plugin/logout"
                    );
                    expect(storeSession).not.to.be.null;
                    expect(storeSession.sid).to.equal(sessionId);
                    expect(await getTotalStoreSessionNum()).to.equal(1);
                });

            await request
                .get(
                    // should work with absolute URL
                    "/auth/logout?redirect=http%3A%2F%2Fexample.com%2Flogout-landing"
                )
                .set("Cookie", [
                    createCookieData(
                        DEFAULT_SESSION_COOKIE_NAME,
                        sessionId,
                        SESSION_SECRET,
                        cookieOptions
                    )
                ])
                .expect((res) => {
                    expect(res.status).to.equals(302);
                    expect(res?.header?.["location"]).to.equals(
                        "http://test-magda.com/auth/login/plugin/my-auth-plugin/logout?redirect=http%3A%2F%2Fexample.com%2Flogout-landing"
                    );
                })
                .then(async (res) => {
                    expect(isNextHandlerCalled).to.equal(false);
                    let currentSession;
                    [currentSession, cookieOptions] = getSetCookie(
                        res.header,
                        DEFAULT_SESSION_COOKIE_NAME
                    );
                    expect(currentSession).to.equal(sessionId);
                    // --- give session store a chance to run before checking
                    await wait(500);
                    // gateway should not attempt to distroy the session
                    // and leave the job to authPlugin (AuthPlugin might need some session data to turn off idP session properly)
                    expect(await getTotalStoreSessionNum()).to.equal(1);
                });
        });

        it("Should forward logout request when plugin register the logoutUrl in session and redirect query param is provided (store authPlugin info in passport session)", async () => {
            const request = setupTest({}, (req, res, next) => {
                // set middleware to simulate authPlugin's setting session data
                // see https://github.com/magda-io/magda/blob/master/docs/docs/authentication-plugin-spec.md
                req.login(
                    {
                        id: "my-user-id",
                        authPlugin: {
                            key: "my-auth-plugin",
                            logoutUrl:
                                "/auth/login/plugin/my-auth-plugin/logout"
                        }
                    },
                    next
                );
            });
            let sessionId: string = null;
            let cookieOptions: PlainObject = {};

            // --- visit /auth/login to create a session first
            await request
                .post("/auth/login/xxxxxx")
                .expect(200)
                .then(async (res) => {
                    expect(isNextHandlerCalled).to.equal(true);
                    isNextHandlerCalled = false;
                    [sessionId, cookieOptions] = getSetCookie(
                        res.header,
                        DEFAULT_SESSION_COOKIE_NAME
                    );
                    expect(sessionId).not.to.be.null;
                    const storeSession = await getStoreSessionById(sessionId);
                    expect(
                        storeSession?.sess?.passport?.user?.authPlugin
                            ?.logoutUrl
                    ).to.equal("/auth/login/plugin/my-auth-plugin/logout");
                    expect(storeSession).not.to.be.null;
                    expect(storeSession.sid).to.equal(sessionId);
                    expect(await getTotalStoreSessionNum()).to.equal(1);
                });

            await request
                .get(
                    // should work with relative URL provided as `redirect` query param
                    // when a relative URL is provided, system will not add magda's externalUrl to it
                    // in order to shorten the url as the authPlugin has the chance to further process it
                    "/auth/logout?redirect=%2Flogout-landing"
                )
                .set("Cookie", [
                    createCookieData(
                        DEFAULT_SESSION_COOKIE_NAME,
                        sessionId,
                        SESSION_SECRET,
                        cookieOptions
                    )
                ])
                .expect((res) => {
                    expect(res.status).to.equals(302);
                    expect(res?.header?.["location"]).to.equals(
                        "http://test-magda.com/auth/login/plugin/my-auth-plugin/logout?redirect=%2Flogout-landing"
                    );
                })
                .then(async (res) => {
                    expect(isNextHandlerCalled).to.equal(false);
                    let currentSession;
                    [currentSession, cookieOptions] = getSetCookie(
                        res.header,
                        DEFAULT_SESSION_COOKIE_NAME
                    );
                    expect(currentSession).to.equal(sessionId);
                    // --- give session store a chance to run before checking
                    await wait(500);
                    // gateway should not attempt to distroy the session
                    // and leave the job to authPlugin (AuthPlugin might need some session data to turn off idP session properly)
                    expect(await getTotalStoreSessionNum()).to.equal(1);
                });
        });
    });

    describe("Test path /sign-in-redirect", () => {
        it("Should destroy the existing session and delete the sessios cookie if result=failure", async () => {
            const request = setupTest();
            let sessionId: string = null;
            let cookieOptions: PlainObject = {};

            // --- visit /auth/login to create a session first
            await request
                .post("/auth/login/xxxxxx")
                .expect(200)
                .then(async (res) => {
                    expect(isNextHandlerCalled).to.equal(true);
                    isNextHandlerCalled = false;
                    [sessionId, cookieOptions] = getSetCookie(
                        res.header,
                        DEFAULT_SESSION_COOKIE_NAME
                    );
                    expect(sessionId).not.to.be.null;
                    const storeSession = await getStoreSessionById(sessionId);
                    expect(storeSession).not.to.be.null;
                    expect(storeSession.sid).to.equal(sessionId);
                    expect(await getTotalStoreSessionNum()).to.equal(1);
                });

            await request
                .get("/sign-in-redirect?a=sss&b=ddd&result=failure")
                .set("Cookie", [
                    createCookieData(
                        DEFAULT_SESSION_COOKIE_NAME,
                        sessionId,
                        SESSION_SECRET,
                        cookieOptions
                    )
                ])
                .expect(200)
                .then(async (res) => {
                    expect(isNextHandlerCalled).to.equal(true);
                    [sessionId, cookieOptions] = getSetCookie(
                        res.header,
                        DEFAULT_SESSION_COOKIE_NAME
                    );
                    expect(sessionId).to.equal("");
                    expect(cookieOptions.Expires).to.equal(
                        "Thu, 01 Jan 1970 00:00:00 GMT"
                    );
                    // --- give session store a chance to run before checking
                    await wait(500);
                    // --- existing session also destroyed in store
                    expect(await getTotalStoreSessionNum()).to.equal(0);
                });
        });

        it("Should keep the existing session if result!=failure", async () => {
            const request = setupTest();
            let sessionId: string = null;
            let cookieOptions: PlainObject = {};

            // --- visit /auth/login to create a session first
            await request
                .post("/auth/login/xxxxxx")
                .expect(200)
                .then(async (res) => {
                    expect(isNextHandlerCalled).to.equal(true);
                    isNextHandlerCalled = false;
                    [sessionId, cookieOptions] = getSetCookie(
                        res.header,
                        DEFAULT_SESSION_COOKIE_NAME
                    );
                    expect(sessionId).not.to.be.null;
                    const storeSession = await getStoreSessionById(sessionId);
                    expect(storeSession).not.to.be.null;
                    expect(storeSession.sid).to.equal(sessionId);
                    expect(await getTotalStoreSessionNum()).to.equal(1);
                });

            await request
                .get("/sign-in-redirect?a=sss&b=ddd&result=success")
                .set("Cookie", [
                    createCookieData(
                        DEFAULT_SESSION_COOKIE_NAME,
                        sessionId,
                        SESSION_SECRET,
                        cookieOptions
                    )
                ])
                .expect(200)
                .then(async (res) => {
                    expect(isNextHandlerCalled).to.equal(true);
                    const [sessionId2] = getSetCookie(
                        res.header,
                        DEFAULT_SESSION_COOKIE_NAME
                    );
                    // --- still the same session & cookie
                    expect(sessionId).to.equal(sessionId2);
                    const storeSession = await getStoreSessionById(sessionId);
                    expect(storeSession).not.to.be.null;
                    expect(storeSession.sid).to.equal(sessionId);
                    expect(await getTotalStoreSessionNum()).to.equal(1);
                });
        });

        it("Should not set cookie header in response if request does not carry session cookie", async () => {
            const request = setupTest();

            await request
                .get("/sign-in-redirect?a=sss&b=ddd&result=success")
                .expect(200)
                .then(async (res) => {
                    expect(isNextHandlerCalled).to.equal(true);
                    const [sessionId, cookieOptions] = getSetCookie(
                        res.header,
                        DEFAULT_SESSION_COOKIE_NAME
                    );
                    expect(sessionId).to.be.null;
                    expect(cookieOptions).to.be.null;
                    expect(await getTotalStoreSessionNum()).to.equal(0);
                });
        });

        it("Should not set cookie header in response if result!=failure", async () => {
            const request = setupTest();

            await request
                .get("/sign-in-redirect?a=sss&b=ddd&result=failure")
                .expect(200)
                .then(async (res) => {
                    expect(isNextHandlerCalled).to.equal(true);
                    const [sessionId, cookieOptions] = getSetCookie(
                        res.header,
                        DEFAULT_SESSION_COOKIE_NAME
                    );
                    expect(sessionId).to.be.null;
                    expect(cookieOptions).to.be.null;
                    expect(await getTotalStoreSessionNum()).to.equal(0);
                });
        });
    });

    describe("Test path /xxxxx (Non /auth/login/* Path)", () => {
        it("Shoud not create any cookie if the session has not started yet", async () => {
            const request = setupTest();

            await request
                .post("/xxxxx")
                .expect(200)
                .then(async (res) => {
                    expect(isNextHandlerCalled).to.equal(true);
                    expect(res.header["set-cookie"]).to.be.undefined;
                    expect(await getTotalStoreSessionNum()).to.equal(0);
                });

            await request
                .get("/xxxxx")
                .expect(200)
                .then(async (res) => {
                    expect(isNextHandlerCalled).to.equal(true);
                    expect(res.header["set-cookie"]).to.be.undefined;
                    expect(await getTotalStoreSessionNum()).to.equal(0);
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
                .then(async (res) => {
                    expect(isNextHandlerCalled).to.equal(true);
                    [sessionId, cookieOptions] = getSetCookie(
                        res.header,
                        DEFAULT_SESSION_COOKIE_NAME
                    );
                    expect(sessionId).not.to.be.null;
                    const storeSession = await getStoreSessionById(sessionId);
                    expect(storeSession).not.to.be.null;
                    expect(storeSession.sid).to.equal(sessionId);
                    expect(await getTotalStoreSessionNum()).to.equal(1);
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
                .then(async (res) => {
                    expect(isNextHandlerCalled).to.equal(true);
                    const [sessionId2] = getSetCookie(
                        res.header,
                        DEFAULT_SESSION_COOKIE_NAME
                    );
                    expect(sessionId2).not.to.be.null;
                    expect(sessionId2).to.equal(sessionId);
                    expect(await getTotalStoreSessionNum()).to.equal(1);
                });
        });

        it("Shoud destroy expired sessions", async () => {
            const request = setupTest({
                // --- session will expire after 100 milseconds
                maxAge: 100
            });
            let sessionId: string = null;
            let cookieOptions = {};

            // --- access a `/auth/login/*` route to create the session
            await request
                .get("/auth/login/xxxxxx")
                .expect(200)
                .then(async (res) => {
                    expect(isNextHandlerCalled).to.equal(true);
                    isNextHandlerCalled = false;
                    [sessionId, cookieOptions] = getSetCookie(
                        res.header,
                        DEFAULT_SESSION_COOKIE_NAME
                    );
                    expect(sessionId).not.to.be.null;
                    const storeSession = await getStoreSessionById(sessionId);
                    expect(storeSession).not.to.be.null;
                    expect(storeSession.sid).to.equal(sessionId);
                    expect(await getTotalStoreSessionNum()).to.equal(1);
                });
            // --- wait for 1s to make sure session has expired
            await wait(2000);
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
                .then(async (res) => {
                    expect(isNextHandlerCalled).to.equal(true);
                    const [sessionId2, cookieOptions2] = getSetCookie(
                        res.header,
                        DEFAULT_SESSION_COOKIE_NAME
                    );
                    expect(sessionId2).to.equal("");
                    expect(cookieOptions2.Expires).to.equal(
                        "Thu, 01 Jan 1970 00:00:00 GMT"
                    );
                    // --- give session store a chance to run before checking
                    await wait(500);
                    // --- existing session also destroyed in store
                    // --- we only destroy the newly created empty session
                    // --- the original expried session is still in store and will be removed by session pruning process
                    expect(await getTotalStoreSessionNum()).to.equal(1);
                    const storeSession = await getStoreSessionById(sessionId);
                    expect(storeSession).not.to.be.null;
                    expect(storeSession.sid).to.equal(sessionId);
                });
        });

        it("Shoud destroy session if incoming session id is invalid", async () => {
            const request = setupTest({
                // --- session will expire after 100 milseconds
                maxAge: 100
            });
            // --- random generate a non exist session id
            // --- session store is empty
            const sessionId: string = randomstring.generate();
            let cookieOptions = { ...DEFAULT_SESSION_COOKIE_OPTIONS };

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
                .then(async (res) => {
                    expect(isNextHandlerCalled).to.equal(true);
                    const [sessionId2, cookieOptions2] = getSetCookie(
                        res.header,
                        DEFAULT_SESSION_COOKIE_NAME
                    );
                    expect(sessionId2).to.equal("");
                    expect(cookieOptions2.Expires).to.equal(
                        "Thu, 01 Jan 1970 00:00:00 GMT"
                    );
                    // --- give session store a chance to run before checking
                    await wait(500);
                    // --- existing session also destroyed in store
                    expect(await getTotalStoreSessionNum()).to.equal(0);
                });
        });
    });
});

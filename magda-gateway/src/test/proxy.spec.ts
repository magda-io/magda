import {} from "mocha";
import sinon from "sinon";
import express from "express";
import nock from "nock";
import _ from "lodash";
import supertest from "supertest";
import URI from "urijs";

import buildApp from "../buildApp";
import chai from "chai";
chai.use(require("chai-as-promised"));
const { expect, assert } = chai;
import { AuthPluginBasicConfig } from "../createAuthPluginRouter";

const PROXY_ROOTS = {
    "/api/v0/registry": "http://registry",
    "/preview-map": "http://preview-map",
    "/map/": "http://map/",
    "/other/foo/bar/": "http://otherplace/foo/bar"
};

const defaultAppOptions = {
    listenPort: 80,
    externalUrl: "http://127.0.0.1",
    dbHost: "localhost",
    dbPort: 5432,
    authDBHost: "localhost",
    authDBPort: 5432,
    proxyRoutesJson: {
        registry: {
            to: "http://registry",
            auth: true
        },
        "timeout-endpoint": "http://timeout.com"
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
    authorizationApi: "http://127.0.0.1",
    sessionSecret: "secret",
    jwtSecret: "othersecret",
    userId: "b1fddd6f-e230-4068-bd2c-1a21844f1598",
    web: "https://127.0.0.1",
    tenantUrl: "http://tenant",
    defaultCacheControl: "DEFAULT CACHE CONTROL",
    authPluginConfigJson: [] as AuthPluginBasicConfig[]
};

describe("proxying", () => {
    let app: express.Application;

    after(() => {
        nock.cleanAll();
    });

    beforeEach(() => {
        app = express();
        app = buildApp(app, defaultAppOptions);
    });

    afterEach(() => {
        if ((<sinon.SinonStub>console.error).restore) {
            (<sinon.SinonStub>console.error).restore();
        }
    });

    describe("Test proxy timeout setting", () => {
        it("request should be processed sucessfully when proxyTimeout = 2000 and processing take 1 seconds ", function (this) {
            this.timeout(5000);

            app = express();
            app = buildApp(app, {
                ...defaultAppOptions,
                proxyTimeout: "2000"
            });

            nock("http://timeout.com").get("/").delay(1000).reply(200);

            return supertest(app).get("/api/v0/timeout-endpoint").expect(200);
        });

        it("request should timeout when proxyTimeout = 2000 and processing take 3.5 seconds ", async function (this) {
            this.timeout(10000);

            app = express();
            app = buildApp(app, {
                ...defaultAppOptions,
                proxyTimeout: "2000"
            });

            nock("http://timeout.com").get("/").delay(3500).reply(200);

            return assert.isRejected(
                supertest(app)
                    .get("/api/v0/timeout-endpoint")
                    .then((res) => {
                        // there are actually two places timeout can be triggered:
                        // http-node-proxy (proxyTimeout setting) or node request socket (timeout setting)
                        // here we tried to capture error from our proxy modules and throw an error similar to the error that would be thrown by node request socket
                        if (
                            res.status === 500 &&
                            res.text === "Something went wrong."
                        ) {
                            throw new Error("socket hang up");
                        }
                    }),
                "socket hang up"
            );
        });

        it("request should be processed sucessfully when proxyTimeout = 4000 and processing take 3.5 seconds ", function (this) {
            this.timeout(10000);

            app = express();
            app = buildApp(app, {
                ...defaultAppOptions,
                proxyTimeout: "4000"
            });

            nock("http://timeout.com").get("/").delay(3500).reply(200);

            return supertest(app).get("/api/v0/timeout-endpoint").expect(200);
        });
    });

    _.map(PROXY_ROOTS, (value, key) => {
        describe(`when proxying ${key} to ${value}`, () => {
            it("doesn't pass auth headers through", () => {
                nock(value, {
                    badheaders: ["Authorization"]
                })
                    .get("/")
                    .reply(200);

                return supertest(app)
                    .get(key)
                    .set("Authorization", "blah")
                    .expect(200);
            });

            it("should rewrite host header", () => {
                nock(value, {
                    reqheaders: {
                        host: URI(value).host()
                    }
                })
                    .get("/")
                    .reply(() => {
                        return 200;
                    });

                return supertest(app).get(key).set("Host", "test").expect(200);
            });

            it("should add default cache control header if not specified", async () => {
                nock(value).get("/").reply(200);

                const res = await supertest(app).get(key);
                expect(res.header["cache-control"]).to.equal(
                    "DEFAULT CACHE CONTROL"
                );
            });

            it("should not override cache control header that's set by the proxied service", async () => {
                nock(value).get("/").reply(200, "", {
                    "cache-control": "Non-default cache control"
                });

                const res = await supertest(app).get(key);
                expect(res.header["cache-control"]).to.equal(
                    "Non-default cache control"
                );
            });

            it("should not set a default cache-control header if none is set", async () => {
                app = express();
                app = buildApp(app, {
                    ...defaultAppOptions,
                    defaultCacheControl: undefined
                });

                nock(value).get("/").reply(200);

                const res = await supertest(app).get(key);
                expect(res.header["cache-control"]).to.be.undefined;
            });

            it("should set headers that prevent cache if incoming request's cache control header contains `no-cache` keyword", async () => {
                nock(value).get("/").reply(200, "Ok", {
                    // we should overwrite this header as the client side specifically ask for not caching it
                    "Cache-Control": "public, max-age=60"
                });

                const res = await supertest(app)
                    .get(key)
                    .set("Cache-Control", "bla bla no-cache");

                expect(res.header["cache-control"]).to.equal(
                    "max-age=0, no-cache, must-revalidate, proxy-revalidate"
                );
                expect(res.header["expires"]).to.equal(
                    "Thu, 01 Jan 1970 00:00:00 GMT"
                );
                const lastModifiedTime = new Date(res.header["last-modified"]);
                // last modified time should be closer enough to the request receive time
                // here we assume it take max 3 seconds for test case to run
                expect(
                    new Date().getTime() - lastModifiedTime.getTime()
                ).to.be.within(0, 3000);
            });
        });
    });
});

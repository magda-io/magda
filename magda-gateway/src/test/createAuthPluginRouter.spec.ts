import {} from "mocha";
import { expect } from "chai";
import express from "express";
import request from "supertest";
import nock from "nock";
import cookie from "cookie";
import setCookieParser from "set-cookie-parser";
import createAuthPluginRouter, {
    EXPRESS_SESSION_DEFAULT_COOKIE_NAME
} from "../createAuthPluginRouter";

describe("Test createAuthPluginRouter", function (this: Mocha.ISuiteCallbackContext) {
    this.timeout(30000);

    after(() => {
        nock.cleanAll();
        nock.enableNetConnect();
    });

    before(() => {
        nock.disableNetConnect();
        nock.enableNetConnect("127.0.0.1");
    });

    it("Session Cookie setting should be correctly overwritten", async () => {
        const app = express();

        nock("http://my-cluster-service-name")
            .get("/")
            .reply(200, "ok", {
                "Set-Cookie": cookie.serialize(
                    EXPRESS_SESSION_DEFAULT_COOKIE_NAME,
                    "my-session-id",
                    {
                        secure: false,
                        sameSite: "lax",
                        httpOnly: true
                    }
                )
            });

        app.use(
            "/auth/login/plugin",
            createAuthPluginRouter({
                plugins: [
                    {
                        key: "test-plugin",
                        baseUrl: "http://my-cluster-service-name"
                    }
                ],
                cookieOptions: {
                    secure: true,
                    sameSite: "strict"
                }
            })
        );

        await request(app)
            .get("/auth/login/plugin/test-plugin")
            .expect((res) => {
                const cookies = setCookieParser.parse(res.header["set-cookie"]);
                expect(cookies.length).to.equal(1);
                expect(cookies[0].value).to.equal("my-session-id");
                // -- cookie setting has been overwritten correctly
                expect(cookies[0].secure).to.be.true;
                expect(cookies[0].sameSite.toLowerCase()).to.equal("strict");
                expect(cookies[0].httpOnly).to.be.undefined;
            });
    });
});

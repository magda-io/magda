import {} from "mocha";
import { expect } from "chai";
import sinon from "sinon";
import pg from "pg";
import express, { Request, Response, NextFunction } from "express";
import request from "supertest";
import nock from "nock";
import createAuthRouter from "../createAuthRouter.js";
import Authenticator from "../Authenticator.js";
import { AuthPluginConfig } from "../createAuthPluginRouter.js";

describe("Test createAuthRouter", function (this) {
    this.timeout(30000);

    after(() => {
        nock.cleanAll();
        nock.enableNetConnect();
    });

    before(() => {
        nock.disableNetConnect();
        nock.enableNetConnect("127.0.0.1");
    });

    function getDummyAuthRouterConfig(
        dummyAuthenticator: Authenticator,
        options: any = {}
    ) {
        return {
            dbPool: sinon.createStubInstance(pg.Pool),
            authenticator: dummyAuthenticator,
            jwtSecret: "dummy",
            googleClientId: "xxxxx",
            googleClientSecret: "xxxxx",
            externalUrl: "http://exmaple.com",
            userId: "000-xxxx-xxxx-xxx-xxx",
            ckanUrl: "xxxx",
            authorizationApi: "xxxx",
            plugins: [
                {
                    key: "test-plugin",
                    baseUrl: "http://my-auth-plugin"
                }
            ],
            ...options
        };
    }

    it("should not apply Authenticator routes (session management) to auth plugin routes", async () => {
        const app = express();
        let isSessionMiddlewareCalled = false;

        const dummyAuthenticator = sinon.createStubInstance(Authenticator);

        dummyAuthenticator.authenticatorMiddleware = (
            req: Request,
            res: Response,
            next: NextFunction
        ) => {
            isSessionMiddlewareCalled = true;
            next();
        };

        const myAuthPluginResponse = Math.random().toString();

        nock("http://my-auth-plugin").get("/").reply(200, myAuthPluginResponse);

        app.use(
            "/auth",
            createAuthRouter(getDummyAuthRouterConfig(dummyAuthenticator))
        );

        await request(app)
            .get("/auth/login/plugin/test-plugin")
            .expect((res) => {
                expect(res.text).to.be.equal(myAuthPluginResponse);
            });

        expect(isSessionMiddlewareCalled).to.be.false;
    });

    it("should not apply Authenticator routes (session management) to /auth/plugins", async () => {
        const app = express();
        let isSessionMiddlewareCalled = false;

        const dummyAuthenticator = sinon.createStubInstance(Authenticator);
        const authPluginConfig: AuthPluginConfig = {
            key: "test-plugin",
            name: "test plugin",
            iconUrl: "http://xxx.com",
            authenticationMethod: "IDP-URI-REDIRECTION"
        };

        dummyAuthenticator.authenticatorMiddleware = (
            req: Request,
            res: Response,
            next: NextFunction
        ) => {
            isSessionMiddlewareCalled = true;
            next();
        };

        const myAuthPluginResponse = Math.random().toString();

        const scope = nock("http://my-auth-plugin");

        scope.get("/").reply(200, myAuthPluginResponse);
        scope.get("/config").reply(200, authPluginConfig);

        app.use(
            "/auth",
            createAuthRouter(getDummyAuthRouterConfig(dummyAuthenticator))
        );

        await request(app)
            .get("/auth/plugins")
            .expect((res) => {
                expect(res.body).to.be.an("array").that.does.lengthOf(1);
                expect(res.body[0]).to.deep.equal(authPluginConfig);
            });

        expect(isSessionMiddlewareCalled).to.be.false;
    });
});

import {} from "mocha";
import sinon from "sinon";
import express from "express";
import nock from "nock";
import _ from "lodash";
import supertest from "supertest";

import Authenticator from "../Authenticator";
import setupTenantMode from "../setupTenantMode";

import createGenericProxyRouter from "../createGenericProxyRouter";
import { expect } from "chai";

describe("createGenericProxyRouter", () => {
    const defaultTenantMode = setupTenantMode({
        enableMultiTenants: false
    });

    afterEach(() => {
        nock.cleanAll();
    });

    it("should accept url string as target proxy definition item", async () => {
        let isApplyToRouteCalled = false;

        const dummyAuthenticator = sinon.createStubInstance(Authenticator);

        dummyAuthenticator.applyToRoute = () => {
            isApplyToRouteCalled = true;
        };

        const router = createGenericProxyRouter({
            authenticator: dummyAuthenticator,
            jwtSecret: "xxx",
            routes: {
                "test-route": "http://test-route.com"
            },
            tenantMode: defaultTenantMode
        });

        const app = express();
        app.use(router);

        const scope = nock("http://test-route.com").get("/").reply(200);

        await supertest(app).get("/test-route").expect(200);
        expect(scope.isDone()).to.be.true;

        // by default no auth
        expect(isApplyToRouteCalled).to.be.false;

        // only `get` route is setup by default
        scope.post("/", {}).reply(200);
        await supertest(app).post("/test-route").expect(404);
    });

    it("should process complete target proxy definition item well", async () => {
        let isApplyToRouteCalled = false;

        const dummyAuthenticator = sinon.createStubInstance(Authenticator);

        dummyAuthenticator.applyToRoute = () => {
            isApplyToRouteCalled = true;
        };

        const router = createGenericProxyRouter({
            authenticator: dummyAuthenticator,
            jwtSecret: "xxx",
            routes: {
                "test-route": {
                    to: "http://test-route.com",
                    auth: true,
                    methods: ["get", "post"]
                }
            },
            tenantMode: defaultTenantMode
        });

        const app = express();
        app.use(router);

        const scope = nock("http://test-route.com").get("/").reply(200);

        await supertest(app).get("/test-route").expect(200);
        expect(scope.isDone()).to.be.true;

        // Auth is on now
        expect(isApplyToRouteCalled).to.be.true;

        // only `post` route is also setup now
        scope.post("/").reply(200);
        await supertest(app).post("/test-route").expect(200);
        expect(scope.isDone()).to.be.true;
    });

    it("should support `all` method", async () => {
        let isApplyToRouteCalled = false;

        const dummyAuthenticator = sinon.createStubInstance(Authenticator);

        dummyAuthenticator.applyToRoute = () => {
            isApplyToRouteCalled = true;
        };

        const router = createGenericProxyRouter({
            authenticator: dummyAuthenticator,
            jwtSecret: "xxx",
            routes: {
                "test-route": {
                    to: "http://test-route.com",
                    auth: false,
                    methods: ["all"]
                }
            },
            tenantMode: defaultTenantMode
        });

        const app = express();
        app.use(router);

        const scope = nock("http://test-route.com").get("/").reply(200);
        await supertest(app).get("/test-route").expect(200);
        expect(scope.isDone()).to.be.true;

        // `post` route is also setup now (as it's `all`)
        scope.post("/").reply(200);
        await supertest(app).post("/test-route").expect(200);
        expect(scope.isDone()).to.be.true;

        // `put` route is also setup now (as it's `all`)
        scope.put("/").reply(200);
        await supertest(app).put("/test-route").expect(200);
        expect(scope.isDone()).to.be.true;

        // `delete` route is also setup now (as it's `all`)
        scope.delete("/").reply(200);
        await supertest(app).delete("/test-route").expect(200);
        expect(scope.isDone()).to.be.true;

        // Auth is off now
        expect(isApplyToRouteCalled).to.be.false;
    });
});

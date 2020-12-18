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

    it("should support specifying different target for different methods", async () => {
        const dummyAuthenticator = sinon.createStubInstance(Authenticator);

        const router = createGenericProxyRouter({
            authenticator: dummyAuthenticator,
            jwtSecret: "xxx",
            routes: {
                "test-route": {
                    to: "http://test-default-route.com",
                    auth: false,
                    methods: [
                        {
                            method: "get",
                            target: "http://test-get-route.com"
                        },
                        {
                            method: "post",
                            target: "http://test-post-route.com"
                        },
                        // --- srting method will use `to` field as default target
                        "delete",
                        {
                            // if target field not exist, `to` field will be used as default target
                            method: "patch"
                        }
                    ]
                }
            },
            tenantMode: defaultTenantMode
        });

        const app = express();
        app.use(router);

        const defaultScope = nock("http://test-default-route.com");
        defaultScope.get("/").reply(200, { route: "default" });
        defaultScope.post("/").reply(200, { route: "default" });
        defaultScope.delete("/").reply(200, { route: "default" });
        defaultScope.patch("/").reply(200, { route: "default" });

        nock("http://test-get-route.com").get("/").reply(200, { route: "get" });
        nock("http://test-post-route.com")
            .post("/")
            .reply(200, { route: "post" });

        // GET request should reach GET route
        let res = await supertest(app).get("/test-route").expect(200);
        expect(res.body.route).to.equal("get");

        // POST request should reach POST route
        res = await supertest(app).post("/test-route").expect(200);
        expect(res.body.route).to.equal("post");

        // DELETE request should reach default route
        res = await supertest(app).delete("/test-route").expect(200);
        expect(res.body.route).to.equal("default");

        // PATCH request should reach default route
        res = await supertest(app).patch("/test-route").expect(200);
        expect(res.body.route).to.equal("default");
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

    it("should forward incoming request path correctly", async () => {
        const dummyAuthenticator = sinon.createStubInstance(Authenticator);

        const router = createGenericProxyRouter({
            authenticator: dummyAuthenticator,
            jwtSecret: "xxx",
            routes: {
                "test-route": {
                    to: "http://test-route.com/routes",
                    auth: true,
                    methods: ["get", "post"]
                }
            },
            tenantMode: defaultTenantMode
        });

        const app = express();
        app.use(router);

        const scope = nock("http://test-route.com");

        let res;
        // check GET routes
        scope.get("/routes").reply(200, { route: "GET:root" });
        res = await supertest(app).get("/test-route").expect(200);
        expect(res.body.route).to.equal("GET:root");

        scope
            .get((uri) => {
                // nock won't match request for tailing path with a query string somehow
                // use function instead
                return uri === "/routes/?sds=232";
            })
            .reply(200, { route: "GET:root", query: "?sds=232" });
        res = await supertest(app).get("/test-route/?sds=232").expect(200);
        expect(res.body.route).to.equal("GET:root");
        expect(res.body.query).to.equal("?sds=232");

        scope.get("/routes/route1").reply(200, { route: "GET:route1" });
        res = await supertest(app).get("/test-route/route1").expect(200);
        expect(res.body.route).to.equal("GET:route1");

        scope
            .get("/routes/route1?sds=232")
            .reply(200, { route: "GET:route1", query: "?sds=232" });
        res = await supertest(app)
            .get("/test-route/route1?sds=232")
            .expect(200);
        expect(res.body.route).to.equal("GET:route1");
        expect(res.body.query).to.equal("?sds=232");

        scope.get("/routes/route2/").reply(200, { route: "GET:route2/" });
        res = await supertest(app).get("/test-route/route2/").expect(200);
        expect(res.body.route).to.equal("GET:route2/");

        scope
            .get((uri) => {
                // nock won't match request for tailing path with a query string somehow
                // use function instead
                return uri === "/routes/route2/?sds=232";
            })
            .reply(200, { route: "GET:route2/", query: "?sds=232" });
        res = await supertest(app)
            .get("/test-route/route2/?sds=232")
            .expect(200);
        expect(res.body.route).to.equal("GET:route2/");
        expect(res.body.query).to.equal("?sds=232");

        scope.get("/routes/route3/12").reply(200, { route: "GET:route3/12" });
        res = await supertest(app).get("/test-route/route3/12").expect(200);
        expect(res.body.route).to.equal("GET:route3/12");

        scope
            .get("/routes/route3/12?sds=232")
            .reply(200, { route: "GET:route3/12", query: "?sds=232" });
        res = await supertest(app)
            .get("/test-route/route3/12?sds=232")
            .expect(200);
        expect(res.body.route).to.equal("GET:route3/12");
        expect(res.body.query).to.equal("?sds=232");

        // check POST routes
        scope.post("/routes/route1").reply(200, { route: "POST:route1" });
        res = await supertest(app).post("/test-route/route1").expect(200);
        expect(res.body.route).to.equal("POST:route1");

        scope.post("/routes/route2/").reply(200, { route: "POST:route2/" });
        res = await supertest(app).post("/test-route/route2/").expect(200);
        expect(res.body.route).to.equal("POST:route2/");

        scope.post("/routes/route3/12").reply(200, { route: "POST:route3/12" });
        res = await supertest(app).post("/test-route/route3/12").expect(200);
        expect(res.body.route).to.equal("POST:route3/12");
    });

    it("should forward incoming request path correctly when route key contains segment (e.g. test-route/abcd)", async () => {
        const dummyAuthenticator = sinon.createStubInstance(Authenticator);

        const router = createGenericProxyRouter({
            authenticator: dummyAuthenticator,
            jwtSecret: "xxx",
            routes: {
                "test-route/abcd": {
                    to: "http://test-route.com/abcd/routes",
                    auth: true,
                    methods: ["get", "post"]
                }
            },
            tenantMode: defaultTenantMode
        });

        const app = express();
        app.use(router);

        const scope = nock("http://test-route.com/abcd");

        let res;
        // check GET routes
        scope.get("/routes").reply(200, { route: "GET:root" });
        res = await supertest(app).get("/test-route/abcd").expect(200);
        expect(res.body.route).to.equal("GET:root");

        scope
            .get((uri) => {
                // nock won't match request for tailing path with a query string somehow
                // use function instead
                return uri === "/abcd/routes/?sds=232";
            })
            .reply(200, { route: "GET:root", query: "?sds=232" });
        res = await supertest(app).get("/test-route/abcd/?sds=232").expect(200);
        expect(res.body.route).to.equal("GET:root");
        expect(res.body.query).to.equal("?sds=232");

        scope.get("/routes/route1").reply(200, { route: "GET:route1" });
        res = await supertest(app).get("/test-route/abcd/route1").expect(200);
        expect(res.body.route).to.equal("GET:route1");

        scope
            .get("/routes/route1?sds=232")
            .reply(200, { route: "GET:route1", query: "?sds=232" });
        res = await supertest(app)
            .get("/test-route/abcd/route1?sds=232")
            .expect(200);
        expect(res.body.route).to.equal("GET:route1");
        expect(res.body.query).to.equal("?sds=232");

        scope.get("/routes/route2/").reply(200, { route: "GET:route2/" });
        res = await supertest(app).get("/test-route/abcd/route2/").expect(200);
        expect(res.body.route).to.equal("GET:route2/");

        scope
            .get((uri) => {
                // nock won't match request for tailing path with a query string somehow
                // use function instead
                return uri === "/abcd/routes/route2/?sds=232";
            })
            .reply(200, { route: "GET:route2/", query: "?sds=232" });
        res = await supertest(app)
            .get("/test-route/abcd/route2/?sds=232")
            .expect(200);
        expect(res.body.route).to.equal("GET:route2/");
        expect(res.body.query).to.equal("?sds=232");

        scope.get("/routes/route3/12").reply(200, { route: "GET:route3/12" });
        res = await supertest(app)
            .get("/test-route/abcd/route3/12")
            .expect(200);
        expect(res.body.route).to.equal("GET:route3/12");

        scope
            .get("/routes/route3/12?sds=232")
            .reply(200, { route: "GET:route3/12", query: "?sds=232" });
        res = await supertest(app)
            .get("/test-route/abcd/route3/12?sds=232")
            .expect(200);
        expect(res.body.route).to.equal("GET:route3/12");
        expect(res.body.query).to.equal("?sds=232");

        // check POST routes
        scope.post("/routes/route1").reply(200, { route: "POST:route1" });
        res = await supertest(app).post("/test-route/abcd/route1").expect(200);
        expect(res.body.route).to.equal("POST:route1");

        scope.post("/routes/route2/").reply(200, { route: "POST:route2/" });
        res = await supertest(app).post("/test-route/abcd/route2/").expect(200);
        expect(res.body.route).to.equal("POST:route2/");

        scope.post("/routes/route3/12").reply(200, { route: "POST:route3/12" });
        res = await supertest(app)
            .post("/test-route/abcd/route3/12")
            .expect(200);
        expect(res.body.route).to.equal("POST:route3/12");
    });
});

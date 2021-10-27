import {} from "mocha";
import request from "supertest";
import urijs from "urijs";
import nock from "nock";
import express from "express";
import addJwtSecretFromEnvVar from "magda-typescript-common/src/session/addJwtSecretFromEnvVar";
//import buildJwt from "magda-typescript-common/src/session/buildJwt";
import fakeArgv from "magda-typescript-common/src/test/fakeArgv";
import createOpaRouter from "../createOpaRouter";
import { expect } from "chai";
import mockDatabase from "./mockDatabase";
import mockUserDataStore from "magda-typescript-common/src/test/mockUserDataStore";
import Database from "../Database";
//import { Request } from "supertest";
import mockApiKeyStore from "./mockApiKeyStore";
import { ANONYMOUS_USERS_ROLE_ID } from "magda-typescript-common/src/authorization-api/constants";
import testDataSimple from "magda-typescript-common/src/test/sampleOpaResponses/simple.json";

describe("Auth api router", function (this: Mocha.ISuiteCallbackContext) {
    this.timeout(10000);

    const opaBaseUrl = "http://localhost:8181/";

    let app: express.Express;
    let argv: any;

    function createOpaNockScope(
        onRequest:
            | ((queryParams: { [key: string]: any }, jsonData: any) => void)
            | null = null,
        response: { [key: string]: any } | null = null
    ) {
        const scope = nock(opaBaseUrl)
            .post("/v1/compile")
            .query(true)
            .once()
            .reply(function (uri, requestBody) {
                if (onRequest) {
                    const query = urijs(uri).search(true);
                    onRequest(query, requestBody);
                }
                const resData = response
                    ? response
                    : {
                          result: {}
                      };
                return JSON.stringify(resData);
            });
        return scope;
    }

    before(function () {
        nock.disableNetConnect();
        nock.enableNetConnect("127.0.0.1");
        argv = retrieveArgv();
        app = buildExpressApp();
    });

    afterEach(function () {
        mockUserDataStore.reset();
        mockApiKeyStore.reset();
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
        const apiRouter = createOpaRouter({
            jwtSecret: argv.jwtSecret,
            database: new mockDatabase() as Database,
            opaUrl: opaBaseUrl
        });

        const app = express();
        app.use(apiRouter);

        return app;
    }

    /*function setMockRequestSession(req: Request, userId: string) {
        return req.set("X-Magda-Session", buildJwt(argv.jwtSecret, userId));
    }*/

    describe("Test `/decision`", () => {
        it("should return 400 status code if not specify operation uri", async () => {
            const scope = createOpaNockScope();

            mockUserDataStore.reset();

            const req = request(app).get(`/decision`);
            await req.then((res) => {
                expect(res.status).to.be.equal(400);
                expect(res.text).to.be.equal(
                    "Please specify `operationUri` for the request"
                );
            });
            expect(scope.isDone()).to.be.equal(false);
        });

        it("should return 200 status code when specify operation uri", async () => {
            let data: any;

            const scope = createOpaNockScope((queryParams, requestData) => {
                data = requestData;
            });

            mockUserDataStore.reset();

            const req = request(app).get(
                `/decision/object/any-object/any-operation`
            );
            await req.then((res) => {
                expect(res.body.hasResidualRules).to.be.equal(false);
                expect(res.body.value).to.be.equal(false);
            });
            expect(scope.isDone()).to.be.equal(true);
            expect(data.unknowns).to.have.members(["input.object.any-object"]);
            expect(data.query).to.be.equal("data.entrypoint.allow");
            expect(data.input.user.roles).to.have.members([
                ANONYMOUS_USERS_ROLE_ID
            ]);
            expect(data.input.operationUri).to.equal(
                "object/any-object/any-operation"
            );
            expect(data.input.resourceUri).to.equal("object/any-object");
            expect(data.input.timestamp).to.be.within(
                Date.now() - 20000,
                Date.now() + 20000
            );
        });

        it("Can supply extra input (extra data) via POST request", async () => {
            let data: any;

            const scope = createOpaNockScope((queryParams, requestData) => {
                data = requestData;
            });

            mockUserDataStore.reset();

            const testNum = Math.random();
            const req = request(app)
                .post(`/decision/object/any-object/any-operation`)
                .send({
                    input: {
                        object: {
                            dataset: {
                                testNum
                            }
                        }
                    }
                });

            await req.then((res) => {
                expect(res.body.hasResidualRules).to.be.equal(false);
                expect(res.body.value).to.be.equal(false);
            });
            expect(scope.isDone()).to.be.equal(true);

            expect(data.unknowns).to.have.members(["input.object.any-object"]);
            expect(data.query).to.be.equal("data.entrypoint.allow");
            expect(data.input.user.roles).to.have.members([
                ANONYMOUS_USERS_ROLE_ID
            ]);
            expect(data.input.operationUri).to.equal(
                "object/any-object/any-operation"
            );
            expect(data.input.object.dataset.testNum).to.equal(testNum);
            expect(data.input.resourceUri).to.equal("object/any-object");
            expect(data.input.timestamp).to.be.within(
                Date.now() - 20000,
                Date.now() + 20000
            );
        });

        it("Can overwrite `unknowns` & `resourceUri` via query parameters", async () => {
            let data: any;

            const scope = createOpaNockScope((queryParams, requestData) => {
                data = requestData;
            });

            mockUserDataStore.reset();

            // overwrite `unknowns` & `resourceUri` via query parameters
            await request(app).get(
                `/decision/object/any-object/any-operation?unknowns=input.x&unknowns=input.y&resourceUri=x/y`
            );

            expect(scope.isDone()).to.be.equal(true);

            expect(data.unknowns).to.have.members(["input.x", "input.y"]);
            expect(data.input.resourceUri).to.equal("x/y");
            expect(data.query).to.be.equal("data.entrypoint.allow");
            expect(data.input.user.roles).to.have.members([
                ANONYMOUS_USERS_ROLE_ID
            ]);
            expect(data.input.operationUri).to.equal(
                "object/any-object/any-operation"
            );
            expect(data.input.timestamp).to.be.within(
                Date.now() - 20000,
                Date.now() + 20000
            );
        });

        it("Can overwrite `unknowns` & `resourceUri` via post request body", async () => {
            let data: any;

            const scope = createOpaNockScope((queryParams, requestData) => {
                data = requestData;
            });

            mockUserDataStore.reset();

            // overwrite `unknowns` & `resourceUri` via query parameters
            await request(app)
                .post(`/decision/object/any-object/any-operation`)
                .send({
                    unknowns: ["input.x", "input.y"],
                    resourceUri: "x/y"
                });

            expect(scope.isDone()).to.be.equal(true);

            expect(data.unknowns).to.have.members(["input.x", "input.y"]);
            expect(data.input.resourceUri).to.equal("x/y");
            expect(data.query).to.be.equal("data.entrypoint.allow");
            expect(data.input.user.roles).to.have.members([
                ANONYMOUS_USERS_ROLE_ID
            ]);
            expect(data.input.operationUri).to.equal(
                "object/any-object/any-operation"
            );
            expect(data.input.timestamp).to.be.within(
                Date.now() - 20000,
                Date.now() + 20000
            );
        });

        it("passing `rawAst` query parameter will output raw opa ast", async () => {
            const scope = createOpaNockScope(null, testDataSimple);

            mockUserDataStore.reset();

            const req = request(app).get(
                `/decision/object/content/*/read?rawAst`
            );

            await req.then((res) => {
                // when `rawAst` set, response raw AST
                expect(res.body).to.have.all.keys("result");
                expect(res.body.result).to.have.all.keys("queries", "support");
                expect(res.body.result.queries).to.be.instanceof(Array);
                expect(res.body.result.support).to.be.instanceof(Array);
            });
            expect(scope.isDone()).to.be.equal(true);
        });

        it("when `rawAst` not set, response parsed concise result", async () => {
            const scope = createOpaNockScope(null, testDataSimple);

            const req = request(app).get(`/decision/object/content/*/read`);

            await req.then((res) => {
                // when `rawAst` not set, response parsed result
                expect(res.body.hasResidualRules).to.be.equal(true);
                expect(res.body.residualRules).to.be.instanceof(Array);
                expect(res.body.residualRules.length).to.be.equal(1);
                expect(
                    res.body.residualRules[0].expressions.length
                ).to.be.equal(1);
                const exp = res.body.residualRules[0].expressions[0];
                expect(exp).to.not.have.property("terms");
                expect(exp.operator).to.be.equal("=");
                expect(exp.operands[0]).to.be.equal("input.object.content.id");
                expect(exp.operands[1]).to.be.equal(
                    "header/navigation/datasets"
                );
            });
            expect(scope.isDone()).to.be.equal(true);
        });

        it("when `rawAst` not set and `concise`=false is set, response parsed result", async () => {
            const scope = createOpaNockScope(null, testDataSimple);

            const req = request(app).get(
                `/decision/object/content/*/read?concise=false`
            );

            await req.then((res) => {
                expect(res.body.hasResidualRules).to.be.equal(true);
                expect(res.body.residualRules).to.be.instanceof(Array);
                expect(res.body.residualRules.length).to.be.equal(1);
                expect(
                    res.body.residualRules[0].expressions.length
                ).to.be.equal(1);
                const exp = res.body.residualRules[0].expressions[0];
                expect(exp).to.have.property("terms");
                expect(exp.terms.length).to.be.equal(3);
            });
            expect(scope.isDone()).to.be.equal(true);
        });

        it("Will pass on `explain` parameter to OPA", async () => {
            let query: any;
            const scope = createOpaNockScope((queryParams) => {
                query = queryParams;
            }, testDataSimple);

            const req = request(app).get(
                `/decision/object/content/*/read?explain=full`
            );

            await req;

            expect(query.explain).to.be.equal("full");
            expect(scope.isDone()).to.be.equal(true);
        });

        it("Will pass on `pretty` parameter to OPA", async () => {
            let query: any;
            const scope = createOpaNockScope((queryParams) => {
                query = queryParams;
            }, testDataSimple);

            const req = request(app).get(
                `/decision/object/content/*/read?pretty=true`
            );

            await req;

            expect(query.pretty).to.be.equal("true");
            expect(scope.isDone()).to.be.equal(true);
        });
    });
});

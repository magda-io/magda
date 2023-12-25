import {} from "mocha";
import {
    require,
    requireResolve
} from "magda-typescript-common/src/esmUtils.js";
import path from "path";
import fse from "fs-extra";
import request from "supertest";
import urijs from "urijs";
import nock from "nock";
import express from "express";
import addJwtSecretFromEnvVar from "magda-typescript-common/src/session/addJwtSecretFromEnvVar.js";
//import buildJwt from "magda-typescript-common/src/session/buildJwt";
import fakeArgv from "magda-typescript-common/src/test/fakeArgv.js";
import createOpaRouter from "../createOpaRouter.js";
import { expect } from "chai";
import mockDatabase from "./mockDatabase.js";
import mockUserDataStore from "magda-typescript-common/src/test/mockUserDataStore.js";
import Database from "../Database.js";
//import { Request } from "supertest";
import mockApiKeyStore from "./mockApiKeyStore.js";
import { ANONYMOUS_USERS_ROLE_ID } from "magda-typescript-common/src/authorization-api/constants.js";
const testDataSimple = require("../../../magda-typescript-common/src/test/sampleOpaResponses/simple.json");
import buildJwt from "magda-typescript-common/src/session/buildJwt.js";

describe("Auth api router", function (this) {
    this.timeout(10000);

    const opaBaseUrl = "http://localhost:8181/";

    let app: express.Express;
    let argv: any;

    function createOpaNockScope(
        onRequest:
            | ((queryParams: { [key: string]: any }, jsonData: any) => void)
            | null = null,
        response: { [key: string]: any } | null = null,
        fullEvaluationEndpoint: boolean = false
    ) {
        const apiEndpoint = fullEvaluationEndpoint
            ? "/v1/data/entrypoint/allow"
            : "/v1/compile";
        const scope = nock(opaBaseUrl)
            .post(apiEndpoint)
            .query(true)
            .once()
            .reply(function (uri, requestBody) {
                if (onRequest) {
                    const query = urijs(uri).search(true);
                    onRequest(query, requestBody);
                }
                const resData = response
                    ? response
                    : fullEvaluationEndpoint
                    ? {
                          result: false
                      }
                    : {
                          result: {}
                      };
                return [200, JSON.stringify(resData)];
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

    describe("Test `/decision`", () => {
        it("should return 400 status code if not specify operation uri", async () => {
            const scope = createOpaNockScope();

            mockUserDataStore.reset();

            const req = request(app).get(`/decision`);
            await req.then((res) => {
                expect(res.status).to.be.equal(400);
                expect(res.text).to.contain(
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
                expect(res.body.result).to.be.equal(false);
            });
            expect(scope.isDone()).to.be.equal(true);
            expect(data.unknowns).to.have.members(["input.object"]);
            expect(data.query).to.be.equal("data.entrypoint.allow");
            expect(
                data.input.user.roles?.map((item: any) => item.id)
            ).to.have.members([ANONYMOUS_USERS_ROLE_ID]);
            expect(data.input.operationUri).to.equal(
                "object/any-object/any-operation"
            );
            expect(data.input.resourceUri).to.equal("object/any-object");
            expect(data.input.timestamp).to.be.within(
                Date.now() - 20000,
                Date.now() + 20000
            );
        });

        it("will not auto-generate `unknowns` (full evaluation) when proper extra input (extra data) via POST request is supplied", async () => {
            let data: any;

            const scope = createOpaNockScope(
                (queryParams, requestData) => {
                    data = requestData;
                },
                null,
                // as input data is supplied at `input.object`, `unknowns` will not be auto set.
                // API will not call compile (partial evaluation endpoint)
                // instead, call full evaluation endpoint for result.
                true
            );

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
                expect(res.body.result).to.be.equal(false);
            });
            expect(scope.isDone()).to.be.equal(true);

            expect(data.unknowns).to.be.undefined;
            expect(
                data.input.user.roles?.map((item: any) => item.id)
            ).to.have.members([ANONYMOUS_USERS_ROLE_ID]);
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

        it("Can supply extra input (extra data) via POST request (with `unknowns` supplied)", async () => {
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
                    },
                    // As input data is supplied at `input.object`, `unknowns` will not be auto set.
                    // However, we manually set `unknowns` here to make sure the request is still sent to compile (partial evaluation endpoint)
                    unknowns: ["input.object.any-object"]
                });

            await req.then((res) => {
                expect(res.body.hasResidualRules).to.be.equal(false);
                expect(res.body.result).to.be.equal(false);
            });
            expect(scope.isDone()).to.be.equal(true);

            expect(data.unknowns).to.have.members(["input.object.any-object"]);
            expect(data.query).to.be.equal("data.entrypoint.allow");
            expect(
                data.input.user.roles?.map((item: any) => item.id)
            ).to.have.members([ANONYMOUS_USERS_ROLE_ID]);
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
            expect(
                data.input.user.roles?.map((item: any) => item.id)
            ).to.have.members([ANONYMOUS_USERS_ROLE_ID]);
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
            expect(
                data.input.user.roles?.map((item: any) => item.id)
            ).to.have.members([ANONYMOUS_USERS_ROLE_ID]);
            expect(data.input.operationUri).to.equal(
                "object/any-object/any-operation"
            );
            expect(data.input.timestamp).to.be.within(
                Date.now() - 20000,
                Date.now() + 20000
            );
        });

        it("Can force stop the endpoint from auto-generating unknowns by passing an empty string via the query parameter `unknowns`", async () => {
            let data: any;

            const scope = createOpaNockScope(
                (queryParams, requestData) => {
                    data = requestData;
                },
                null,
                // as `unknowns` is not set, request will be evaluated by full evaluation endpoint
                true
            );

            mockUserDataStore.reset();

            // set unknowns to an empty string should stop endpoint from auto-generating unknowns
            await request(app).get(
                `/decision/object/any-object/any-operation?unknowns=`
            );

            expect(scope.isDone()).to.be.equal(true);

            expect(data.unknowns).to.be.undefined;
            expect(data.query).to.be.undefined;
            expect(
                data.input.user.roles?.map((item: any) => item.id)
            ).to.have.members([ANONYMOUS_USERS_ROLE_ID]);
            expect(data.input.operationUri).to.equal(
                "object/any-object/any-operation"
            );
            expect(data.input.timestamp).to.be.within(
                Date.now() - 20000,
                Date.now() + 20000
            );
        });

        it("Can force stop the endpoint from auto-generating unknowns by passing an empty string via the post body parameter `unknowns`", async () => {
            let data: any;

            const scope = createOpaNockScope(
                (queryParams, requestData) => {
                    data = requestData;
                },
                null,
                // as `unknowns` is not set, request will be evaluated by full evaluation endpoint
                true
            );

            mockUserDataStore.reset();

            await request(app)
                .post(`/decision/object/any-object/any-operation`)
                .send({
                    // set unknowns to an empty string should stop endpoint from auto-generating unknowns
                    unknowns: ""
                });

            expect(scope.isDone()).to.be.equal(true);

            expect(data.unknowns).to.be.undefined;
            expect(data.query).to.be.undefined;
            expect(
                data.input.user.roles?.map((item: any) => item.id)
            ).to.have.members([ANONYMOUS_USERS_ROLE_ID]);
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
                expect(exp.operands[0]).to.be.deep.equal({
                    isRef: true,
                    value: "input.object.content.id"
                });
                expect(exp.operands[1]).to.be.deep.equal({
                    isRef: false,
                    value: "header/navigation/datasets"
                });
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

        it("should making decisions using the correct users info based on singed JWT token carried in request header", async () => {
            let data: any;

            mockUserDataStore.reset();

            const user = mockUserDataStore.createRecord({
                displayName: "test user",
                photoURL: "",
                isAdmin: false,
                email: "xxx@email123.com",
                source: "source_1",
                sourceId: "source_id_1"
            });

            const scope = createOpaNockScope((queryParams, requestData) => {
                data = requestData;
            });
            const req = request(app)
                .get(`/decision/object/any-object/any-operation`)
                .set("X-Magda-Session", buildJwt(argv.jwtSecret, user.id));

            const res = await req;
            // should be no error and return 200 status code
            expect(res.ok).to.be.equal(true);
            expect(res.body.hasResidualRules).to.be.equal(false);
            expect(res.body.result).to.be.equal(false);
            expect(scope.isDone()).to.be.equal(true);
            expect(data.input.user.id).to.equal(user.id);
            expect(data.input.user.email).to.equal(user.email);
            expect(data.input.operationUri).to.equal(
                "object/any-object/any-operation"
            );
            expect(data.input.resourceUri).to.equal("object/any-object");
            expect(data.input.timestamp).to.be.within(
                Date.now() - 20000,
                Date.now() + 20000
            );
        });

        it("should making decisions using anonymous users info when failed to retrieve the user info (user doesn't exist)", async () => {
            let data: any;

            mockUserDataStore.reset();

            const scope = createOpaNockScope((queryParams, requestData) => {
                data = requestData;
            });
            const req = request(app)
                .get(`/decision/object/any-object/any-operation`)
                .set(
                    "X-Magda-Session",
                    buildJwt(
                        argv.jwtSecret,
                        "ddd4a2ca-c536-45a9-8bee-eea21c630e4b"
                    )
                );

            const res = await req;
            // should be no error and return 200 status code
            expect(res.ok).to.be.equal(true);
            expect(res.body.hasResidualRules).to.be.equal(false);
            expect(res.body.result).to.be.equal(false);
            expect(scope.isDone()).to.be.equal(true);
            expect(
                data.input.user.roles?.map((item: any) => item.id)
            ).to.have.members([ANONYMOUS_USERS_ROLE_ID]);
            expect(data.input.operationUri).to.equal(
                "object/any-object/any-operation"
            );
            expect(data.input.resourceUri).to.equal("object/any-object");
            expect(data.input.timestamp).to.be.within(
                Date.now() - 20000,
                Date.now() + 20000
            );
        });
    });

    describe("Test `/decision` endpoint decision evlautation & encoding: ", () => {
        const testSampleRoot = path.resolve(
            requireResolve("@magda/typescript-common/package.json"),
            "../src/test/"
        );

        const opaSampleRoot = path.resolve(
            testSampleRoot,
            "./sampleOpaResponses"
        );
        const decisionSampleRoot = path.resolve(
            testSampleRoot,
            "./sampleAuthDecisions"
        );

        const items = fse.readdirSync(opaSampleRoot);

        for (let i = 0; i < items.length; i++) {
            const file = items[i];
            if (path.extname(file).toLowerCase() !== ".json") {
                return;
            }

            it(`should parse & evaluate OPA response "${file}"`, async function () {
                this.timeout(3000);
                console.time("decision-endpoint-parse-evaluate-opa-time");
                const sampleOpaResponse = fse.readJSONSync(
                    path.resolve(opaSampleRoot, file)
                );
                const sampleDecision = fse.readJSONSync(
                    path.resolve(decisionSampleRoot, file)
                );

                const scope = createOpaNockScope(null, sampleOpaResponse);

                const req = request(app).get(
                    `/decision/object/someObject/someOperation`
                );

                await req.then((res) => {
                    expect(res.body).to.be.deep.equal(sampleDecision);
                });
                expect(scope.isDone()).to.be.equal(true);
                console.timeEnd("decision-endpoint-parse-evaluate-opa-time");
            });
        }
    });
});

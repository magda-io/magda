import * as _ from "lodash";
import {} from "mocha";
import { expect } from "chai";
import * as express from "express";
// import * as sinon from "sinon";
import * as nock from "nock";
import jsc from "@magda/typescript-common/dist/test/jsverify";
import {
    setupNock,
    doGet,
    getStateForStatus,
    mockJobs,
    mockConnectorConfig
} from "./helpers";
import * as request from "supertest";

import buildApiRouter from "../buildApiRouter";
import { stateArb } from "./arbitraries";

describe("admin api router", function(this: Mocha.ISuiteCallbackContext) {
    this.timeout(10000);
    let app: express.Express;
    let k8sApiScope: nock.Scope;

    const beforeEachInner = () => {
        const apiRouter = buildApiRouter({
            dockerRepo: "dockerRepo",
            authApiUrl: "http://admin.example.com",
            imageTag: "imageTag",
            kubernetesApiType: "test",
            registryApiUrl: "http://registry.example.com"
        });

        app = express();
        app.use(apiRouter);
        k8sApiScope = nock("https://example.com");
    };

    beforeEach(beforeEachInner);

    const afterEachInner = () => {
        k8sApiScope.done();
        nock.cleanAll();
    };

    afterEach(afterEachInner);

    describe("GET /connectors", () => {
        it("should show information about everything recorded in the connector-config map, along with associated jobs if they exist", () => {
            return jsc.assert(
                jsc.forall(stateArb, state => {
                    beforeEachInner();
                    setupNock(k8sApiScope, state);

                    return doGet(app)
                        .then(res => {
                            expect(res.status).to.equal(200);

                            const withConfig = _.filter(
                                state,
                                (value, key) => !_.isUndefined(value.config)
                            );

                            expect(res.body.length).to.equal(withConfig.length);

                            res.body.forEach((connectorRes: any) => {
                                const id = connectorRes.id;

                                const correspondingState = state[id];
                                expect(correspondingState).not.to.be.undefined;

                                expect(connectorRes.name).to.equal(
                                    correspondingState.config.name
                                );
                                expect(connectorRes.sourceUrl).to.equal(
                                    correspondingState.config.sourceUrl
                                );
                                expect(connectorRes.type).to.equal(
                                    correspondingState.config.type
                                );

                                expect(
                                    _.isUndefined(connectorRes.job)
                                ).to.equal(
                                    _.isUndefined(correspondingState.job)
                                );

                                if (!_.isUndefined(correspondingState.job)) {
                                    expect(connectorRes.job.name).to.equal(
                                        `connector-${id}`
                                    );
                                    expect(
                                        connectorRes.job.completionTime
                                    ).to.equal(
                                        correspondingState.job.completionTime
                                    );
                                    expect(connectorRes.job.startTime).to.equal(
                                        correspondingState.job.startTime
                                    );
                                }
                            });

                            afterEachInner();
                        })
                        .then(() => true)
                        .catch(e => {
                            afterEachInner();
                            throw e;
                        });
                })
            );
        });

        describe("should display status", () => {
            ["active", "failed", "succeeded"].forEach(status =>
                it(`${status} when ${status}`, () => {
                    setupNock(k8sApiScope, getStateForStatus(status));
                    return assertStatus(status);
                })
            );

            ["", "blah", null].forEach(status =>
                it(`inactive for '${status}'`, () => {
                    setupNock(k8sApiScope, getStateForStatus(status));
                    return assertStatus("inactive");
                })
            );

            function assertStatus(status: string) {
                return doGet(app).then(res => {
                    expect(res.body[0].job.status).to.equal(status);
                });
            }
        });

        describe("should reply 401 for", () => {
            it("an unauthenticated user", () => {
                return request(app)
                    .get("/connectors")
                    .then(res => {
                        expect(res.status).to.equal(401);
                    });
            });

            it("an authenticated user who isn't an admin", () => {
                return doGet(app, false).then(res => {
                    expect(res.status).to.equal(401);
                });
            });
        });

        describe("should return 500 for", () => {
            const state = getStateForStatus("active");

            it("a failure to get jobs", () => {
                mockConnectorConfig(k8sApiScope, 200, state);
                mockJobs(k8sApiScope, 500);
            });

            it("a failure to get connector config", () => {
                mockConnectorConfig(k8sApiScope, 500);
                mockJobs(k8sApiScope, 200, state);
            });

            it("a failure to get both", () => {
                mockConnectorConfig(k8sApiScope, 500);
                mockJobs(k8sApiScope, 500);
            });

            afterEach(() => {
                return doGet(app).then(res => {
                    expect(res.status).to.equal(500);
                });
            });
        });
    });
});

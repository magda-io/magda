import * as _ from "lodash";
import {} from "mocha";
import { expect } from "chai";
import * as express from "express";
import * as sinon from "sinon";
import * as nock from "nock";
import jsc from "@magda/typescript-common/dist/test/jsverify";
import * as helpers from "./helpers";
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
        app.use(require("body-parser").json());
        app.use(apiRouter);
        k8sApiScope = nock("https://kubernetes.example.com");
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
                    helpers.setupNock(k8sApiScope, state);

                    return helpers
                        .getConnectors(app)
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
                            console.error(e);
                            afterEachInner();
                            throw e;
                        });
                })
            );
        });

        describe("should display status", () => {
            ["active", "failed", "succeeded"].forEach(status =>
                it(`${status} when ${status}`, () => {
                    helpers.setupNock(
                        k8sApiScope,
                        helpers.getStateForStatus(status)
                    );
                    return assertStatus(status);
                })
            );

            ["", "blah", null].forEach(status =>
                it(`inactive for '${status}'`, () => {
                    helpers.setupNock(
                        k8sApiScope,
                        helpers.getStateForStatus(status)
                    );
                    return assertStatus("inactive");
                })
            );

            function assertStatus(status: string) {
                return helpers.getConnectors(app).then(res => {
                    expect(res.body[0].job.status).to.equal(status);
                });
            }
        });

        silenceErrorLogs(() => {
            describe("should reply 401 for", () => {
                it("an unauthenticated user", () => {
                    return request(app)
                        .get("/connectors")
                        .then(res => {
                            expect(res.status).to.equal(401);
                        });
                });

                it("an authenticated user who isn't an admin", () => {
                    return helpers.getConnectors(app, false).then(res => {
                        expect(res.status).to.equal(401);
                    });
                });
            });

            describe("should return 500 for", () => {
                const state = helpers.getStateForStatus("active");

                it("a failure to get jobs", () => {
                    helpers.mockConnectorConfig(k8sApiScope, 200, state);
                    helpers.mockJobs(k8sApiScope, 500);
                });

                it("a failure to get connector config", () => {
                    helpers.mockConnectorConfig(k8sApiScope, 500);
                    helpers.mockJobs(k8sApiScope, 200, state);
                });

                it("a failure to get both", () => {
                    helpers.mockConnectorConfig(k8sApiScope, 500);
                    helpers.mockJobs(k8sApiScope, 500);
                });

                afterEach(() => {
                    return helpers.getConnectors(app).then(res => {
                        expect(res.status).to.equal(500);
                    });
                });
            });
        });
    });

    describe("PUT /connectors/:id", () => {
        const name = "test";

        const connectorConfig = {
            who: "cares"
        };

        it("should put a new entry in the k8s connector-config configmap", () => {
            const expectedConfigMap = {
                [`${name}.json`]: JSON.stringify(connectorConfig)
            };

            k8sApiScope
                .patch(
                    "/api/v1/namespaces/default/configmaps/connector-config",
                    {
                        data: expectedConfigMap
                    }
                )
                .reply(200, expectedConfigMap);

            return helpers
                .putConnector(app, name, connectorConfig)
                .then(res => {
                    expect(res.status).to.equal(200);

                    k8sApiScope.done();
                });
        });

        silenceErrorLogs(() => {
            it("should return 500 if k8s call doesn't work", () => {
                k8sApiScope
                    .patch(
                        "/api/v1/namespaces/default/configmaps/connector-config",
                        () => true
                    )
                    .reply(500, "Oh noes");

                return helpers
                    .putConnector(app, name, connectorConfig)
                    .then(res => {
                        expect(res.status).to.equal(500);

                        k8sApiScope.done();
                    });
            });

            describe("should reply 401 for", () => {
                it("an unauthenticated user", () => {
                    return request(app)
                        .put(`/connectors/${name}`)
                        .send(connectorConfig)
                        .then(res => {
                            expect(res.status).to.equal(401);
                        });
                });

                it("an authenticated user who isn't an admin", () => {
                    return helpers
                        .putConnector(app, name, connectorConfig, false)
                        .then(res => {
                            expect(res.status).to.equal(401);
                        });
                });
            });
        });
    });

    function silenceErrorLogs(inner: () => void) {
        describe("(with silent console.error or console.warn)", () => {
            beforeEach(() => {
                sinon.stub(console, "error").callsFake(() => {});
                sinon.stub(console, "warn").callsFake(() => {});
            });

            afterEach(() => {
                (console.error as any).restore();
                (console.warn as any).restore();
            });

            inner();
        });
    }
});

import jsc from "@magda/typescript-common/dist/test/jsverify";
import * as _ from "lodash";
import {} from "mocha";
import * as request from "supertest";
import { expect } from "chai";
import * as express from "express";
// import * as sinon from "sinon";
import * as nock from "nock";

import * as fixtures from "./fixtures";
import buildApiRouter from "../buildApiRouter";
import {
    stateArb,
    State,
    ConnectorState,
    ConfigState,
    JobState
} from "./arbitraries";

describe("admin api router", function(this: Mocha.ISuiteCallbackContext) {
    this.timeout(10000);
    let app: express.Express;
    let k8sApiScope: nock.Scope;

    const beforeEachInner = () => {
        const apiRouter = buildApiRouter({
            dockerRepo: "dockerRepo",
            authApiUrl: "http://example.com",
            imageTag: "imageTag",
            kubernetesApiType: "test",
            registryApiUrl: "http://example.com"
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
        it("should show current status of crawlers from K8S API", () => {
            return jsc.assert(
                jsc.forall(stateArb, state => {
                    beforeEachInner();
                    setupNock(state);

                    return doGet()
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
                    setupNockForStatus(status);
                    return assertStatus(status);
                })
            );

            ["", "blah", null].forEach(status =>
                it(`inactive for '${status}'`, () => {
                    setupNockForStatus("");
                    return assertStatus("inactive");
                })
            );

            function assertStatus(status: string) {
                return doGet().then(res => {
                    expect(res.body[0].job.status).to.equal(status);
                });
            }
        });

        function doGet() {
            return request(app).get("/connectors");
        }

        function setupNockForStatus(status: string) {
            setupNock({
                connector: {
                    config: {
                        type: "type",
                        name: "name",
                        sourceUrl: "sourceUrl"
                    },
                    job: {
                        startTime: "startTime",
                        completionTime: "completionTime",
                        status
                    }
                }
            });
        }

        function setupNock(state: State) {
            k8sApiScope
                .get("/api/v1/namespaces/default/configmaps/connector-config")
                .reply(
                    200,
                    fixtures.getConfigMap(_(state)
                        .mapValues((value: ConnectorState) => value.config)
                        .pickBy(_.identity)
                        .value() as { [id: string]: ConfigState })
                );

            k8sApiScope.get("/apis/batch/v1/namespaces/default/jobs").reply(
                200,
                fixtures.getJobs(_(state)
                    .mapValues((value: ConnectorState) => value.job)
                    .pickBy(_.identity)
                    .value() as { [id: string]: JobState })
            );
        }
    });
});

import buildApiRouter from "../buildApiRouter";
import {} from "mocha";
import * as request from "supertest";
import { expect } from "chai";
import * as express from "express";
// import * as sinon from "sinon";
import * as nock from "nock";
import * as fixtures from "./fixtures";
import jsc from "@magda/typescript-common/dist/test/jsverify";
// import {} from "@magda/typescript-common/dist/test/arbitraries";

describe("admin api router", () => {
    let app: express.Express;
    let k8sApiScope: nock.Scope;

    beforeEach(() => {
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
    });

    describe("GET /connectors", () => {
        it("should show current status of crawlers from K8S API", () => {
            jsc.record({
                abc: jsc.constant("hello")
            });

            setupNock("active");

            return doGet().then(res => {
                expect(res.status).to.equal(200);

                expect(res.body.length).to.be.greaterThan(0);
                expect(res.body[0].id).to.equal("id");
                expect(res.body[0].type).to.equal("type");
                expect(res.body[0].name).to.equal("name");
                expect(res.body[0].sourceUrl).to.equal("sourceUrl");
                expect(res.body[0].job.startTime).to.equal("startTime");
                expect(res.body[0].job.completionTime).to.equal(
                    "completionTime"
                );
                expect(res.body[0].job.status).to.equal("active");

                k8sApiScope.done();
            });
        });

        describe("should display status", () => {
            ["active", "failed", "succeeded"].forEach(status =>
                it(`${status} when ${status}`, () => {
                    setupNock(status);
                    return assertStatus(status);
                })
            );

            ["", "blah", null].forEach(status =>
                it(`inactive for '${status}'`, () => {
                    setupNock("");
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

        function setupNock(status: string) {
            k8sApiScope
                .get("/api/v1/namespaces/default/configmaps/connector-config")
                .reply(
                    200,
                    fixtures.getConfigMap({
                        id: {
                            type: "type",
                            name: "name",
                            sourceUrl: "sourceUrl"
                        }
                    })
                );

            k8sApiScope.get("/apis/batch/v1/namespaces/default/jobs").reply(
                200,
                fixtures.getJobs({
                    id: {
                        startTime: "startTime",
                        completionTime: "completionTime",
                        status
                    }
                })
            );
        }
    });
});

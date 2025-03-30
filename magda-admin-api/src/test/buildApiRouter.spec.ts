import _ from "lodash";
import {} from "mocha";
import { expect } from "chai";
import express from "express";
import nock from "nock";
import request from "supertest";
import buildApiRouter from "../buildApiRouter.js";
import createMockAuthDecisionQueryClient from "magda-typescript-common/src/test/createMockAuthDecisionQueryClient.js";
import AuthDecision, {
    UnconditionalTrueDecision,
    UnconditionalFalseDecision
} from "magda-typescript-common/src/opa/AuthDecision.js";
import buildConnectorCronJobManifest from "../buildConnectorCronJobManifest.js";
import { Connector } from "../k8sApi.js";
import { AuthDecisionReqConfig } from "magda-typescript-common/src/opa/AuthDecisionQueryClient.js";
import * as k8s from "@kubernetes/client-node";

describe("admin api router", function (this) {
    this.timeout(10000);
    const namespace = "THISISANAMESPACE";
    let app: express.Express;
    let k8sApiScope: nock.Scope;
    const registryApiUrl = "http://registry.example.com";
    const authApiUrl = "http://admin.example.com";

    function buildExpressApp(
        authDecisionOrOperationUri: AuthDecision | string
    ) {
        const apiRouter = buildApiRouter({
            dockerRepo: "dockerRepo",
            authApiUrl,
            imageTag: "imageTag",
            registryApiUrl: registryApiUrl,
            pullPolicy: "pullPolicy",
            namespace,
            jwtSecret: "secret",
            userId: "b1fddd6f-e230-4068-bd2c-1a21844f1598",
            tenantId: 0,
            authDecisionClient: createMockAuthDecisionQueryClient(
                typeof authDecisionOrOperationUri === "string"
                    ? async (
                          config: AuthDecisionReqConfig,
                          jwtToken?: string
                      ) =>
                          config?.operationUri === authDecisionOrOperationUri
                              ? UnconditionalTrueDecision
                              : UnconditionalFalseDecision
                    : authDecisionOrOperationUri
            ),
            testMode: true
        });

        app = express();
        app.use(express.json());
        app.use(apiRouter);

        return app;
    }

    const beforeEachInner = () => {
        k8sApiScope = nock("http://mock-k8s-api.com").defaultReplyHeaders({
            "Content-type": "application/json"
        });
        nock.disableNetConnect();
        nock.enableNetConnect("127.0.0.1");
    };

    beforeEach(beforeEachInner);

    const afterEachInner = () => {
        k8sApiScope.done();
        nock.enableNetConnect();
        nock.cleanAll();
    };

    afterEach(afterEachInner);

    describe("GET /connectors", () => {
        function setupK8sApiMock() {
            k8sApiScope
                .get(`/apis/batch/v1/namespaces/${namespace}/cronjobs`)
                .reply(200, {
                    items: [
                        buildConnectorCronJobManifest({
                            id: "c1",
                            namespace,
                            registryApiUrl,
                            tenantId: 0,
                            defaultUserId: "xxxxxx1",
                            schedule: "0 14 * * 6",
                            dockerImageString: "docker.io/dkkd:v1"
                        }),
                        buildConnectorCronJobManifest({
                            id: "c2",
                            namespace,
                            registryApiUrl,
                            tenantId: 0,
                            defaultUserId: "xxxxxx2",
                            schedule: "0 14 * * 7",
                            dockerImageString: "docker.io/dkkd:v1"
                        })
                    ]
                });

            k8sApiScope
                .get(`/api/v1/namespaces/${namespace}/configmaps/connector-c1`)
                .reply(200, {
                    data: {
                        "config.json": `{"extras": {"data":"test-data-c1"}}`
                    }
                });
            k8sApiScope
                .get(`/api/v1/namespaces/${namespace}/configmaps/connector-c2`)
                .reply(200, {
                    data: {
                        "config.json": `{"extras": {"data":"test-data-c2"}}`
                    }
                });
        }

        it("should make correct API call to batch & core API to retrieve cronJob & configMap info of all connectors", async () => {
            buildExpressApp("object/connector/read");
            setupK8sApiMock();

            const res = await request(app).get("/connectors").expect(200);
            const connectors = res.body as Connector[];

            expect(connectors.length).to.equal(2);
            expect(connectors[0].id).to.equal("c1");
            expect(connectors[1].id).to.equal("c2");
            expect(connectors[0].cronJob.metadata.name).to.equal(
                "connector-c1"
            );
            expect(connectors[1].cronJob.metadata.name).to.equal(
                "connector-c2"
            );
            expect(connectors[0].configData.extras.data).to.equal(
                "test-data-c1"
            );
            expect(connectors[1].configData.extras.data).to.equal(
                "test-data-c2"
            );
            expect(connectors[0].schedule).to.equal("0 14 * * 6");
            expect(connectors[1].schedule).to.equal("0 14 * * 7");

            k8sApiScope.done();
        });

        it("should response 403 when user has no permission to access", async () => {
            app = buildExpressApp("object/connector/never-match-operation");
            await request(app).get("/connectors").expect(403);
        });
    });

    describe("GET /connectors/:id", () => {
        function setupK8sApiMock() {
            k8sApiScope
                .get(
                    `/apis/batch/v1/namespaces/${namespace}/cronjobs/connector-c1`
                )
                .reply(
                    200,
                    buildConnectorCronJobManifest({
                        id: "c1",
                        namespace,
                        registryApiUrl,
                        tenantId: 0,
                        defaultUserId: "xxxxxx1",
                        schedule: "0 14 * * 6",
                        dockerImageString: "docker.io/dkkd:v1"
                    })
                );

            k8sApiScope
                .get(`/api/v1/namespaces/${namespace}/configmaps/connector-c1`)
                .reply(200, {
                    data: {
                        "config.json": `{"extras": {"data":"test-data-c1"}}`
                    }
                });
        }

        it("should make correct API call to batch & core API to retrieve cronJob & configMap info of the connector", async () => {
            buildExpressApp("object/connector/read");
            setupK8sApiMock();

            const res = await request(app).get("/connectors/c1").expect(200);
            const connector = res.body as Connector;

            expect(connector.id).to.equal("c1");
            expect(connector.cronJob.metadata.name).to.equal("connector-c1");
            expect(connector.configData.extras.data).to.equal("test-data-c1");
            expect(connector.schedule).to.equal("0 14 * * 6");

            k8sApiScope.done();
        });

        it("should response 403 when user has no permission to access", async () => {
            app = buildExpressApp("object/connector/never-match-operation");
            await request(app).get("/connectors/c1").expect(403);
        });
    });

    describe("POST /connectors/:id/start", () => {
        function setupK8sApiMock() {
            const cronJob = buildConnectorCronJobManifest({
                id: "c1",
                namespace,
                registryApiUrl,
                tenantId: 0,
                defaultUserId: "xxxxxx1",
                schedule: "0 14 * * 6",
                dockerImageString: "docker.io/dkkd:v1"
            });

            k8sApiScope
                .patch(
                    `/apis/batch/v1/namespaces/${namespace}/cronjobs/connector-c1`
                )
                .reply(function (this: any, uri, requestBody) {
                    expect(this.req.headers["content-type"]).to.contain(
                        "application/merge-patch+json"
                    );
                    expect(
                        JSON.parse(requestBody as string).spec.suspend
                    ).to.equal(false);
                    return [200, cronJob];
                });
        }

        it("should make correct API call to set `suspend` field of cronjob manifest", async () => {
            buildExpressApp("object/connector/update");
            setupK8sApiMock();

            const res = await request(app)
                .post("/connectors/c1/start")
                .expect(200);
            expect(res.body.result).to.equal(true);
            k8sApiScope.done();
        });

        it("should response 403 when user has no permission to access", async () => {
            app = buildExpressApp("object/connector/never-match-operation");
            await request(app).post("/connectors/c1/start").expect(403);
        });
    });

    describe("POST /connectors/:id/stop", () => {
        function setupK8sApiMock() {
            const cronJob = buildConnectorCronJobManifest({
                id: "c1",
                namespace,
                registryApiUrl,
                tenantId: 0,
                defaultUserId: "xxxxxx1",
                schedule: "0 14 * * 6",
                dockerImageString: "docker.io/dkkd:v1"
            });

            k8sApiScope
                .patch(
                    `/apis/batch/v1/namespaces/${namespace}/cronjobs/connector-c1`
                )
                .reply(function (this: any, uri, requestBody) {
                    expect(this.req.headers["content-type"]).to.contain(
                        "application/merge-patch+json"
                    );
                    expect(
                        JSON.parse(requestBody as string).spec.suspend
                    ).to.equal(true);
                    return [200, cronJob];
                });
        }

        it("should make correct API call to set `suspend` field of cronjob manifest", async () => {
            buildExpressApp("object/connector/update");
            setupK8sApiMock();

            const res = await request(app)
                .post("/connectors/c1/stop")
                .expect(200);
            expect(res.body.result).to.equal(true);
            k8sApiScope.done();
        });

        it("should response 403 when user has no permission to access", async () => {
            app = buildExpressApp("object/connector/never-match-operation");
            await request(app).post("/connectors/c1/stop").expect(403);
        });
    });

    describe("POST /connectors", () => {
        function setupK8sApiMock(
            noExistingConfigMap: boolean = true,
            noExistingCronJob: boolean = true
        ) {
            const cronJob = buildConnectorCronJobManifest({
                id: "c1",
                namespace,
                registryApiUrl,
                tenantId: 0,
                defaultUserId: "xxxxxx1",
                schedule: "0 14 * * 6",
                dockerImageString: "docker.io/dkkd:v1"
            });

            if (noExistingCronJob) {
                k8sApiScope
                    .get(
                        `/apis/batch/v1/namespaces/${namespace}/cronjobs/connector-c1`
                    )
                    .reply(404, "not found");
            } else {
                k8sApiScope
                    .get(
                        `/apis/batch/v1/namespaces/${namespace}/cronjobs/connector-c1`
                    )
                    .reply(200, cronJob);
            }

            if (noExistingConfigMap) {
                k8sApiScope
                    .get(
                        `/api/v1/namespaces/${namespace}/configmaps/connector-c1`
                    )
                    .reply(404, "not found");
            } else {
                k8sApiScope
                    .get(
                        `/api/v1/namespaces/${namespace}/configmaps/connector-c1`
                    )
                    .reply(200, {
                        id: "c1",
                        name: "test connector"
                    });
            }
        }

        it("should respond 400 when connector already exist", async () => {
            buildExpressApp("object/connector/create");

            k8sApiScope
                .get(
                    `/apis/batch/v1/namespaces/${namespace}/cronjobs/connector-c1`
                )
                .reply(
                    200,
                    buildConnectorCronJobManifest({
                        id: "c1",
                        namespace,
                        registryApiUrl,
                        tenantId: 0,
                        defaultUserId: "xxxxxx1",
                        schedule: "0 14 * * 6",
                        dockerImageString: "docker.io/dkkd:v1"
                    })
                );

            await request(app)
                .post("/connectors")
                .send({
                    id: "c1",
                    name: "test connector",
                    dockerImageString:
                        "ghcr.io/magda-io/magda-ckan-connector:2.1.0",
                    sourceUrl: "http://data-source.com",
                    pageSize: 99,
                    schedule: "0 14 * * 6"
                })
                .expect(400);

            k8sApiScope.done();
        });

        it("should respond 400 when `schedule` field is not supplied", async () => {
            buildExpressApp("object/connector/create");

            k8sApiScope
                .get(
                    `/apis/batch/v1/namespaces/${namespace}/cronjobs/connector-c1`
                )
                .reply(404);

            const res = await request(app)
                .post("/connectors")
                .send({
                    id: "c1",
                    name: "test connector",
                    dockerImageString:
                        "ghcr.io/magda-io/magda-ckan-connector:2.1.0",
                    sourceUrl: "http://data-source.com",
                    pageSize: 99
                })
                .expect(400);

            expect(res.text.indexOf("schedule") !== -1).to.equal(true);

            k8sApiScope.done();
        });

        it("should respond 400 when insufficient docker image info is supplied", async () => {
            buildExpressApp("object/connector/create");

            k8sApiScope
                .get(
                    `/apis/batch/v1/namespaces/${namespace}/cronjobs/connector-c1`
                )
                .reply(404);

            const res = await request(app)
                .post("/connectors")
                .send({
                    id: "c1",
                    name: "test connector",
                    sourceUrl: "http://data-source.com",
                    pageSize: 99,
                    schedule: "0 14 * * 6"
                })
                .expect(400);

            expect(res.text).to.equal(
                "Either `dockerImageString` or all `dockerImageName`, `dockerRepo` and `dockerImageTag` fields are required."
            );

            k8sApiScope.done();
        });

        it("should create connector with post configMap request when configmap doesn't exist", async () => {
            buildExpressApp("object/connector/create");
            setupK8sApiMock();

            k8sApiScope
                .post(`/api/v1/namespaces/${namespace}/configmaps`)
                .reply(function (this: any, uri, requestBody) {
                    expect(this.req.headers["content-type"]).to.contain(
                        "application/json"
                    );
                    expect(
                        JSON.parse((requestBody as any).data["config.json"])
                    ).to.deep.equal({
                        id: "c1",
                        name: "test connector",
                        sourceUrl: "http://data-source.com",
                        pageSize: 99,
                        schedule: "0 14 * * 6"
                    });
                    const requestConfigMap: k8s.V1ConfigMap = requestBody as any;
                    k8sApiScope
                        .get(
                            `/api/v1/namespaces/${namespace}/configmaps/connector-c1`
                        )
                        .reply(200, requestConfigMap);
                    return [200, requestConfigMap];
                });

            k8sApiScope
                .post(`/apis/batch/v1/namespaces/${namespace}/cronjobs`)
                .reply(function (this: any, uri, requestBody) {
                    expect(this.req.headers["content-type"]).to.contain(
                        "application/json"
                    );
                    const requestCronJob: k8s.V1CronJob = requestBody as any;
                    expect(requestCronJob.spec.schedule).to.equal("0 14 * * 6");
                    expect(requestCronJob.metadata.name).to.equal(
                        "connector-c1"
                    );
                    expect(
                        requestCronJob.metadata.labels[
                            "app.kubernetes.io/managed-by"
                        ]
                    ).to.equal("Magda");
                    k8sApiScope
                        .get(
                            `/apis/batch/v1/namespaces/${namespace}/cronjobs/connector-c1`
                        )
                        .reply(200, requestCronJob);
                    return [200, requestCronJob];
                });

            const res = await request(app)
                .post("/connectors")
                .send({
                    id: "c1",
                    name: "test connector",
                    dockerImageString:
                        "ghcr.io/magda-io/magda-ckan-connector:2.1.0",
                    sourceUrl: "http://data-source.com",
                    pageSize: 99,
                    schedule: "0 14 * * 6"
                })
                .expect(200);

            expect(res.body.id).to.equal("c1");
            k8sApiScope.done();
        });

        it("should create connector with patch configMap request when configmap exists", async () => {
            buildExpressApp("object/connector/create");
            setupK8sApiMock(false);

            k8sApiScope
                .patch(
                    `/api/v1/namespaces/${namespace}/configmaps/connector-c1`
                )
                .reply(function (this: any, uri, requestBody) {
                    expect(this.req.headers["content-type"]).to.contain(
                        "application/merge-patch+json"
                    );
                    expect(
                        JSON.parse(
                            JSON.parse(requestBody as string).data[
                                "config.json"
                            ]
                        )
                    ).to.deep.equal({
                        id: "c1",
                        name: "test connector",
                        sourceUrl: "http://data-source.com",
                        pageSize: 99,
                        schedule: "0 14 * * 6"
                    });
                    const requestConfigMap: k8s.V1ConfigMap = requestBody as any;
                    k8sApiScope
                        .get(
                            `/api/v1/namespaces/${namespace}/configmaps/connector-c1`
                        )
                        .reply(200, requestConfigMap);
                    return [200, requestConfigMap];
                });

            k8sApiScope
                .post(`/apis/batch/v1/namespaces/${namespace}/cronjobs`)
                .reply(function (this: any, uri, requestBody) {
                    expect(this.req.headers["content-type"]).to.contain(
                        "application/json"
                    );
                    const requestCronJob: k8s.V1CronJob = requestBody as any;
                    expect(requestCronJob.spec.schedule).to.equal("0 14 * * 6");
                    expect(requestCronJob.metadata.name).to.equal(
                        "connector-c1"
                    );
                    expect(
                        requestCronJob.metadata.labels[
                            "app.kubernetes.io/managed-by"
                        ]
                    ).to.equal("Magda");
                    k8sApiScope
                        .get(
                            `/apis/batch/v1/namespaces/${namespace}/cronjobs/connector-c1`
                        )
                        .reply(200, requestCronJob);
                    return [200, requestCronJob];
                });

            const res = await request(app)
                .post("/connectors")
                .send({
                    id: "c1",
                    name: "test connector",
                    dockerImageString:
                        "ghcr.io/magda-io/magda-ckan-connector:2.1.0",
                    sourceUrl: "http://data-source.com",
                    pageSize: 99,
                    schedule: "0 14 * * 6"
                })
                .expect(200);

            expect(res.body.id).to.equal("c1");
            k8sApiScope.done();
        });

        it("should response 403 when user has no permission to access", async () => {
            app = buildExpressApp("object/connector/never-match-operation");
            await request(app)
                .post("/connectors")
                .send({
                    id: "c1",
                    name: "test connector",
                    dockerImageString:
                        "ghcr.io/magda-io/magda-ckan-connector:2.1.0",
                    sourceUrl: "http://data-source.com",
                    pageSize: 99,
                    schedule: "0 14 * * 6"
                })
                .expect(403);
        });
    });

    describe("PUT /connectors/:id", () => {
        function setupK8sApiMock(managedBy: string = "Magda") {
            const cronJob = buildConnectorCronJobManifest({
                id: "c1",
                namespace,
                registryApiUrl,
                tenantId: 0,
                defaultUserId: "xxxxxx1",
                schedule: "0 14 * * 6",
                dockerImageString: "docker.io/dkkd:v1"
            });

            cronJob.metadata.labels["app.kubernetes.io/managed-by"] = managedBy;

            k8sApiScope
                .get(
                    `/apis/batch/v1/namespaces/${namespace}/cronjobs/connector-c1`
                )
                .reply(200, cronJob);

            const configMap = new k8s.V1ConfigMap();
            configMap.data = {
                "config.json": JSON.stringify({
                    id: "c1",
                    name: "test connector",
                    sourceUrl: "http://data-source.com",
                    pageSize: 99
                })
            };

            k8sApiScope
                .get(`/api/v1/namespaces/${namespace}/configmaps/connector-c1`)
                .reply(200, configMap);
        }

        it("should respond 400 when connector is managed by Helm", async () => {
            buildExpressApp("object/connector/update");
            setupK8sApiMock("Helm");

            const res = await request(app)
                .put("/connectors/c1")
                .send({
                    id: "c1",
                    name: "test connector",
                    dockerImageString:
                        "ghcr.io/magda-io/magda-ckan-connector:2.1.0",
                    sourceUrl: "http://data-source.com",
                    pageSize: 99,
                    schedule: "0 14 * * 6"
                })
                .expect(400);

            expect(res.text).to.equal(
                "Cannot update a connector that is managed as part of the deployed Helm chart."
            );
            k8sApiScope.done();
        });

        it("should only patch configmap when `schedule` field is not supplied", async () => {
            buildExpressApp("object/connector/update");
            setupK8sApiMock("Magda");

            k8sApiScope
                .patch(
                    `/api/v1/namespaces/${namespace}/configmaps/connector-c1`
                )
                .reply(function (this: any, uri, requestBody) {
                    expect(this.req.headers["content-type"]).to.contain(
                        "application/merge-patch+json"
                    );
                    expect(
                        JSON.parse(
                            JSON.parse(requestBody as string).data[
                                "config.json"
                            ]
                        )
                    ).to.deep.include({
                        id: "c1",
                        name: "test connector",
                        sourceUrl: "http://data-source.com",
                        pageSize: 99
                    });
                    const requestConfigMap: k8s.V1ConfigMap = requestBody as any;
                    k8sApiScope
                        .get(
                            `/api/v1/namespaces/${namespace}/configmaps/connector-c1`
                        )
                        .reply(200, requestConfigMap);

                    k8sApiScope
                        .get(
                            `/apis/batch/v1/namespaces/${namespace}/cronjobs/connector-c1`
                        )
                        .reply(
                            200,
                            buildConnectorCronJobManifest({
                                id: "c1",
                                namespace,
                                registryApiUrl,
                                tenantId: 0,
                                defaultUserId: "xxxxxx1",
                                schedule: "0 14 * * 6",
                                dockerImageString: "docker.io/dkkd:v1"
                            })
                        );
                    return [200, requestConfigMap];
                });

            await request(app)
                .put("/connectors/c1")
                .send({
                    id: "c1",
                    name: "test connector",
                    dockerImageString:
                        "ghcr.io/magda-io/magda-ckan-connector:2.1.0",
                    sourceUrl: "http://data-source.com",
                    pageSize: 99
                })
                .expect(200);

            k8sApiScope.done();
        });

        it("should patch cronJob as well when `schedule` field is supplied", async () => {
            buildExpressApp("object/connector/update");
            setupK8sApiMock("Magda");

            k8sApiScope
                .patch(
                    `/api/v1/namespaces/${namespace}/configmaps/connector-c1`
                )
                .reply(function (this: any, uri, requestBody) {
                    expect(this.req.headers["content-type"]).to.contain(
                        "application/merge-patch+json"
                    );
                    expect(
                        JSON.parse(
                            JSON.parse(requestBody as string).data[
                                "config.json"
                            ]
                        )
                    ).to.deep.include({
                        id: "c1",
                        name: "test connector",
                        sourceUrl: "http://data-source.com",
                        pageSize: 99,
                        schedule: "0 14 * * 6"
                    });
                    const requestConfigMap: k8s.V1ConfigMap = requestBody as any;
                    k8sApiScope
                        .get(
                            `/api/v1/namespaces/${namespace}/configmaps/connector-c1`
                        )
                        .reply(200, requestConfigMap);
                    return [200, requestConfigMap];
                });

            k8sApiScope
                .patch(
                    `/apis/batch/v1/namespaces/${namespace}/cronjobs/connector-c1`
                )
                .reply(function (this: any, uri, requestBody) {
                    expect(this.req.headers["content-type"]).to.contain(
                        "application/merge-patch+json"
                    );
                    const requestCronJob: k8s.V1CronJob = JSON.parse(
                        requestBody as string
                    );
                    expect(requestCronJob.spec.schedule).to.equal("0 14 * * 6");
                    k8sApiScope
                        .get(
                            `/apis/batch/v1/namespaces/${namespace}/cronjobs/connector-c1`
                        )
                        .reply(
                            200,
                            buildConnectorCronJobManifest({
                                id: "c1",
                                namespace,
                                registryApiUrl,
                                tenantId: 0,
                                defaultUserId: "xxxxxx1",
                                schedule: "0 14 * * 6",
                                dockerImageString: "docker.io/dkkd:v1"
                            })
                        );
                    return [200, requestCronJob];
                });

            await request(app)
                .put("/connectors/c1")
                .send({
                    id: "c1",
                    name: "test connector",
                    dockerImageString:
                        "ghcr.io/magda-io/magda-ckan-connector:2.1.0",
                    sourceUrl: "http://data-source.com",
                    pageSize: 99,
                    schedule: "0 14 * * 6"
                })
                .expect(200);

            k8sApiScope.done();
        });

        it("should response 403 when user has no permission to access", async () => {
            app = buildExpressApp("object/connector/never-match-operation");
            await request(app)
                .put("/connectors/c1")
                .send({
                    id: "c1",
                    name: "test connector",
                    dockerImageString:
                        "ghcr.io/magda-io/magda-ckan-connector:2.1.0",
                    sourceUrl: "http://data-source.com",
                    pageSize: 99,
                    schedule: "0 14 * * 6"
                })
                .expect(403);
        });
    });

    describe("DELETE /connectors/:id", () => {
        function setupK8sApiMock(managedBy: string = "Magda") {
            const cronJob = buildConnectorCronJobManifest({
                id: "c1",
                namespace,
                registryApiUrl,
                tenantId: 0,
                defaultUserId: "xxxxxx1",
                schedule: "0 14 * * 6",
                dockerImageString: "docker.io/dkkd:v1"
            });

            cronJob.metadata.labels["app.kubernetes.io/managed-by"] = managedBy;

            k8sApiScope
                .get(
                    `/apis/batch/v1/namespaces/${namespace}/cronjobs/connector-c1`
                )
                .reply(200, cronJob);

            const configMap = new k8s.V1ConfigMap();
            configMap.data = {
                "config.json": JSON.stringify({
                    id: "c1",
                    name: "test connector",
                    sourceUrl: "http://data-source.com",
                    pageSize: 99
                })
            };

            k8sApiScope
                .get(`/api/v1/namespaces/${namespace}/configmaps/connector-c1`)
                .reply(200, configMap);
        }

        it("should respond 400 when connector is managed by Helm", async () => {
            buildExpressApp("object/connector/delete");
            setupK8sApiMock("Helm");

            const res = await request(app).delete("/connectors/c1").expect(400);

            expect(res.text).to.equal(
                "Cannot delete a connector that is managed as part of the deployed Helm chart."
            );
            k8sApiScope.done();
        });

        it("should request to delete cronjob & configmap correctly", async () => {
            buildExpressApp("object/connector/delete");
            setupK8sApiMock();

            k8sApiScope
                .delete(
                    `/apis/batch/v1/namespaces/${namespace}/cronjobs/connector-c1`
                )
                .reply(200, {});
            k8sApiScope
                .delete(
                    `/api/v1/namespaces/${namespace}/configmaps/connector-c1`
                )
                .reply(200, {});

            const res = await request(app).delete("/connectors/c1").expect(200);

            expect(res.body.result).to.equal(true);
            k8sApiScope.done();
        });

        it("should response 403 when user has no permission to access", async () => {
            app = buildExpressApp("object/connector/never-match-operation");
            await request(app).delete("/connectors/c1").expect(403);
        });
    });
});

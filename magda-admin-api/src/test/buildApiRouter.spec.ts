import _ from "lodash";
import {} from "mocha";
import { expect } from "chai";
import express from "express";
import nock from "nock";
import request from "supertest";
import buildApiRouter from "../buildApiRouter";
import createMockAuthDecisionQueryClient from "magda-typescript-common/src/test/createMockAuthDecisionQueryClient";
import AuthDecision, {
    UnconditionalTrueDecision,
    UnconditionalFalseDecision
} from "magda-typescript-common/src/opa/AuthDecision";
import buildConnectorCronJobManifest from "../buildConnectorCronJobManifest";
import { Connector } from "../k8sApi";

describe("admin api router", function (this: Mocha.ISuiteCallbackContext) {
    this.timeout(10000);
    const namespace = "THISISANAMESPACE";
    let app: express.Express;
    let k8sApiScope: nock.Scope;
    const k8sServiceHost = process.env.KUBERNETES_SERVICE_HOST;
    const k8sServicePort = process.env.KUBERNETES_SERVICE_PORT;
    const registryApiUrl = "http://registry.example.com";
    const authApiUrl = "http://admin.example.com";

    function buildExpressApp(
        authDecision: AuthDecision = UnconditionalTrueDecision
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
            authDecisionClient: createMockAuthDecisionQueryClient(authDecision),
            testMode: true
        });

        const app = express();
        app.use(require("body-parser").json());
        app.use(apiRouter);

        return app;
    }

    const beforeEachInner = () => {
        k8sApiScope = nock("http://mock-k8s-api.com");
        nock.disableNetConnect();
        nock.enableNetConnect("127.0.0.1");
        app = buildExpressApp();
        process.env.KUBERNETES_SERVICE_HOST = "kubernetes.example.com";
        process.env.KUBERNETES_SERVICE_PORT = "80";
    };

    beforeEach(beforeEachInner);

    const afterEachInner = () => {
        k8sApiScope.done();
        nock.enableNetConnect();
        nock.cleanAll();
        process.env.KUBERNETES_SERVICE_HOST = k8sServiceHost;
        process.env.KUBERNETES_SERVICE_PORT = k8sServicePort;
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
            app = buildExpressApp(UnconditionalFalseDecision);
            await request(app).get("/connectors").expect(403);
        });
    });
});

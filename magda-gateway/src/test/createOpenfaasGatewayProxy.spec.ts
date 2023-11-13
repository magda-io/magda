import {} from "mocha";
import express from "express";
import { expect } from "chai";
import nock, { Scope } from "nock";
import supertest from "supertest";
import createOpenfaasGatewayProxy from "../createOpenfaasGatewayProxy";
import setupTenantMode from "../setupTenantMode";
import createMockAuthDecisionQueryClient, {
    MockAuthDecisionClientConfig
} from "magda-typescript-common/src/test/createMockAuthDecisionQueryClient";
import {
    UnconditionalTrueDecision,
    UnconditionalFalseDecision
} from "magda-typescript-common/src/opa/AuthDecision";
import { getUserId } from "magda-typescript-common/src/session/GetUserId";

describe("Test createOpenfaasGatewayProxy", () => {
    const openfaasGatewayUrl = "http://gateway.openfaas.com";
    const jwtSecret = "test-jwt";
    let openfaasGatewayScope: Scope;
    const testUserId = "6987c543-da7c-4695-99ef-d6bc2e900078";

    function getUserIdFromJwtToken(jwtToken?: string) {
        if (!jwtToken) {
            return undefined;
        }
        return getUserId(
            {
                header: () => jwtToken
            } as any,
            jwtSecret
        ).valueOrThrow();
    }

    after(() => {
        nock.cleanAll();
        nock.enableNetConnect();
    });

    before(() => {
        nock.disableNetConnect();
        // Allow localhost connections so we can test local routes and mock servers.
        nock.enableNetConnect("127.0.0.1");

        function responseGenerator(this: any, uri: string, requestBody: any) {
            return {
                uri,
                requestBody,
                userId: getUserIdFromJwtToken(
                    this.req.headers["x-magda-session"]
                )
            };
        }

        openfaasGatewayScope = nock(openfaasGatewayUrl).persist();
        openfaasGatewayScope.get(/.*/).reply(200, responseGenerator);
        openfaasGatewayScope.post(/.*/).reply(200, responseGenerator);
        openfaasGatewayScope.put(/.*/).reply(200, responseGenerator);
        openfaasGatewayScope.delete(/.*/).reply(200, responseGenerator);
    });

    /**
     * Create the test request
     *
     * @param {string} [userId] optional parameter. Specified the authenticated userId. If undefined, indicates user not logged in yet.
     * @returns
     */
    function createTestRequest(
        authDecisionOrHandler: MockAuthDecisionClientConfig,
        userId: string = testUserId
    ) {
        const tenantMode = setupTenantMode({
            enableMultiTenants: false
        });

        const mockAuthenticator: any = {
            applyToRoute: (app: express.Router) => {
                app.use((req, _res, next) => {
                    if (typeof userId === "string") {
                        // --- always logged in as user with id `userId`
                        (req.user as any) = {
                            id: userId
                        };
                    }
                    next();
                });
            }
        };

        const authDecisionClient = createMockAuthDecisionQueryClient(
            authDecisionOrHandler
        );

        const app: express.Application = express();
        app.use(
            createOpenfaasGatewayProxy({
                gatewayUrl: openfaasGatewayUrl,
                authClient: authDecisionClient,
                apiRouterOptions: {
                    jwtSecret,
                    tenantMode,
                    authenticator: mockAuthenticator,
                    routes: {},
                    authClient: authDecisionClient
                }
            })
        );

        return supertest(app);
    }

    function test(
        endpoint: string,
        requiredOperation: string,
        requestCreator: (
            app: supertest.SuperTest<supertest.Test>
        ) => supertest.Test
    ) {
        describe(`Test endpoint ${endpoint}`, () => {
            it(`should require permission of operation ${requiredOperation}`, async () => {
                const testReq = createTestRequest((config, jwtToken) => {
                    expect(config.operationUri).to.equal(requiredOperation);
                    expect(getUserIdFromJwtToken(jwtToken)).to.equal(
                        testUserId
                    );
                    return Promise.resolve(UnconditionalTrueDecision);
                });
                const response = await requestCreator(testReq).expect(200);
                expect(response.body.userId).to.equal(testUserId);
            });

            it(`should response 403 when not sufficient permission`, async () => {
                const testReq = createTestRequest((config, jwtToken) => {
                    expect(config.operationUri).to.equal(requiredOperation);
                    expect(getUserIdFromJwtToken(jwtToken)).to.equal(
                        testUserId
                    );
                    return Promise.resolve(UnconditionalFalseDecision);
                });
                await requestCreator(testReq).expect(403);
            });
        });
    }

    test("/system/functions", "object/faas/function/read", (app) =>
        app.get("/system/functions")
    );

    test("/system/functions", "object/faas/function/create", (app) =>
        app.post("/system/functions")
    );

    test("/system/functions", "object/faas/function/update", (app) =>
        app.put("/system/functions")
    );

    test("/system/functions", "object/faas/function/delete", (app) =>
        app.delete("/system/functions")
    );

    test("/system/function/:functionName", "object/faas/function/read", (app) =>
        app.get("/system/function/test-function")
    );

    test("/function/:functionName", "object/faas/function/invoke", (app) =>
        app.post("/function/test-function")
    );

    test(
        "/async-function/:functionName",
        "object/faas/function/invoke",
        (app) => app.post("/async-function/test-function")
    );
});

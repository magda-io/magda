import {} from "mocha";
import request from "supertest";
import express from "express";
import { Response } from "supertest";
import { expect } from "chai";
import createTenantsRouter from "../createTenantsRouter";
import mockDatabase from "./mockDatabase";
import Database from "../Database";
import mockTenantDataStore from "magda-typescript-common/src/test/mockTenantDataStore";
import { Tenant } from "magda-typescript-common/src/tenant-api/Tenant";
import {
    MAGDA_TENANT_ID_HEADER,
    MAGDA_ADMIN_PORTAL_ID
} from "magda-typescript-common/src/registry/TenantConsts";
import createMockAuthDecisionQueryClient from "magda-typescript-common/src/test/createMockAuthDecisionQueryClient";
import AuthDecision, {
    UnconditionalTrueDecision,
    UnconditionalFalseDecision
} from "magda-typescript-common/src/opa/AuthDecision";
import { AuthDecisionReqConfig } from "magda-typescript-common/src/opa/AuthDecisionQueryClient";

describe("Tenant api router", function (this: Mocha.ISuiteCallbackContext) {
    const nonAdminPortalId = MAGDA_ADMIN_PORTAL_ID + 1;
    const jwtSecret = "a top secret";
    const authApiUrl = "http://auth.some.where";

    function buildExpressApp(
        authDecisionOrOperationUri: AuthDecision | string
    ) {
        const mockDb: any = new mockDatabase();
        const apiRouter = createTenantsRouter({
            jwtSecret: jwtSecret,
            database: mockDb as Database,
            authApiUrl: authApiUrl,
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
            )
        });

        const app = express();
        app.use(express.json());
        app.use(apiRouter);
        return app;
    }

    const beforeEachInner = () => {
        mockTenantDataStore.reset();
    };

    beforeEach(beforeEachInner);

    const afterEachInner = () => {
        mockTenantDataStore.reset();
    };

    afterEach(afterEachInner);

    function getTenants(
        tenantId: number,
        app: express.Application
    ): Promise<Response> {
        return request(app)
            .get("/tenants")
            .set(`${MAGDA_TENANT_ID_HEADER}`, tenantId.toString());
    }

    function addTenant(
        tenantId: number,
        newTenant: any,
        app: express.Application
    ): Promise<Response> {
        return request(app)
            .post("/tenants")
            .set(`${MAGDA_TENANT_ID_HEADER}`, tenantId.toString())
            .send(newTenant);
    }

    describe("GET /tenants", () => {
        it("should return all tenants", async () => {
            const app = buildExpressApp("object/tenant/read");
            const res = await getTenants(MAGDA_ADMIN_PORTAL_ID, app);
            const actualTenants: Tenant[] = res.body;
            return expect(actualTenants).to.deep.equal(
                mockTenantDataStore.getTenants()
            );
        });

        it("should reject get tenants request if tenant ID is incorrect", async () => {
            const app = buildExpressApp("object/tenant/read");
            const res = await getTenants(nonAdminPortalId, app);
            return expect(res.status).to.equal(400);
        });

        it("should response 403 when user has no permission to access", async () => {
            const app = buildExpressApp("object/tenant/never-match-operation");
            const res = await getTenants(MAGDA_ADMIN_PORTAL_ID, app);
            expect(res.status).to.equal(403);
        });
    });

    describe("POST /tenants", () => {
        it("should add a tenant", async () => {
            const app = buildExpressApp("object/tenant/create");
            const newTenant = {
                domainname: "test.com",
                enabled: true
            };

            const res = await addTenant(MAGDA_ADMIN_PORTAL_ID, newTenant, app);
            const actualTenant: Tenant = res.body;
            expect(actualTenant.id).to.equal(
                mockTenantDataStore.countTenants() - 1
            );
            expect(actualTenant.domainname).to.equal("test.com");
            return expect(actualTenant.enabled).to.equal(true);
        });

        it("should reject add tenant request if tenant ID is incorrect", async () => {
            const app = buildExpressApp("object/tenant/create");
            const newTenant = {
                domainname: "test.com",
                enabled: true
            };

            const res = await addTenant(nonAdminPortalId, newTenant, app);
            return expect(res.status).to.equal(400);
        });

        it("should response 403 when user has no permission to access", async () => {
            const app = buildExpressApp("object/tenant/never-match-operation");
            const newTenant = {
                domainname: "test.com",
                enabled: true
            };
            const res = await addTenant(MAGDA_ADMIN_PORTAL_ID, newTenant, app);
            expect(res.status).to.equal(403);
        });
    });
});

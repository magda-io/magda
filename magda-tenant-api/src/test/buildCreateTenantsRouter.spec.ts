import {} from "mocha";
import * as request from "supertest";
import * as express from "express";
import addJwtSecretFromEnvVar from "@magda/typescript-common/dist/session/addJwtSecretFromEnvVar";
// import buildJwt from "@magda/typescript-common/dist/session/buildJwt";
import fakeArgv from "@magda/typescript-common/dist/test/fakeArgv";
import createTenantsRouter from "../createTenantsRouter";
import { expect } from "chai";
import mockDatabase from "./mockDatabase";
import mockTenantDataStore from "@magda/typescript-common/dist/test/mockTenantDataStore";
import Database from "../Database";
// import { Request } from "supertest";

import { Tenant } from "@magda/typescript-common/dist/tenant-api/Tenant";
import { MAGDA_TENANT_ID_HEADER, MAGDA_ADMIN_PORTAL_ID } from "@magda/typescript-common/dist/registry/TenantConsts";

describe("Tenant api router", function(this: Mocha.ISuiteCallbackContext) {
    this.timeout(10000);

    let app: express.Express;
    let argv: any;

    before(function() {
        argv = retrieveArgv();
        app = buildExpressApp();
    });

    beforeEach(function() {
        mockTenantDataStore.reset();
    })

    afterEach(function() {
        mockTenantDataStore.reset();
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
        const mockDb: any = new mockDatabase();
        const apiRouter = createTenantsRouter({
            jwtSecret: argv.jwtSecret,
            database: mockDb as Database
        });

        const app = express();
        app.use(require("body-parser").json());
        app.use(apiRouter);

        return app;
    }

    // function setMockRequestSession(req: Request, userId: string) {
    //     return req.set("X-Magda-Session", buildJwt(argv.jwtSecret, userId));
    // }

    describe("Tenant API", () => {

        it("should return all tenants", async () => {
            const req = request(app)
            .get("/tenants")
            .set(`${MAGDA_TENANT_ID_HEADER}`, MAGDA_ADMIN_PORTAL_ID.toString())

            const res = await req.then(res => res);
            expect(res.status).to.equal(200);
            const actualTenants: Tenant[] = res.body;
            expect(actualTenants.length).to.equal(mockTenantDataStore.countTenants());
            const actualDomainNames = actualTenants.map(tenant => tenant.domainname).sort;
            const expectedDomainNames = mockTenantDataStore.getTenants().map(tenant => tenant.domainname).sort;
            expect(actualDomainNames).to.equal(expectedDomainNames);
        });

        it("should reject get tenants request if tenant ID is incorrect", async () => {
            const req = request(app)
            .get("/tenants")
            .set(`${MAGDA_TENANT_ID_HEADER}`, '1')

            const res = await req.then(res => res);
            expect(res.status).to.equal(400);
        });

        it("should reject get tenants request if tenant ID header does not exist", async () => {
            const req = request(app)
            .get("/tenants")

            const res = await req.then(res => res);
            expect(res.status).to.equal(400);
        });

        it("should add a tenant", async () => {
            const newTenant =  {
                domainname: 'test.com',
                enabled: true
            };

            const req = request(app)
            .post("/tenants")
            .set(`${MAGDA_TENANT_ID_HEADER}`, MAGDA_ADMIN_PORTAL_ID.toString())
            .send(newTenant);

            const res = await req.then(res => res);
            const actualTenant: Tenant = res.body;
            expect(actualTenant.id).to.equal(mockTenantDataStore.countTenants() - 1);
            expect(actualTenant.domainname).to.equal('test.com');
            expect(actualTenant.enabled).to.equal(true);
        })

        it("should reject add tenant request if tenant ID is incorrect", async () => {
            const newTenant =  {
                domainname: 'test.com',
                enabled: true
            };

            const req = request(app)
            .post("/tenants")
            .set(`${MAGDA_TENANT_ID_HEADER}`, '1')
            .send(newTenant);

            const res = await req.then(res => res);
            expect(res.status).to.equal(400);
        })

        it("should reject add tenant request if tenant ID header does not exist", async () => {
            const newTenant =  {
                domainname: 'test.com',
                enabled: true
            };

            const req = request(app)
            .post("/tenants")
            .send(newTenant);

            const res = await req.then(res => res);
            expect(res.status).to.equal(400);
        })
    });
});

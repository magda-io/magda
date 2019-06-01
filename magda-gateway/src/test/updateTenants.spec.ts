import setupTenantMode from "../setupTenantMode";
import {updateTenants, tenantsTable } from "../reloadTenants";
import { Tenant } from "@magda/typescript-common/dist/generated/registry/api";
import { MAGDA_ADMIN_PORTAL_ID } from "@magda/typescript-common/dist/registry/TenantConsts";

import { expect } from "chai";
import * as nock from "nock";

describe("Test updateTenants", () => {
    const registryUrl = "http://localhost/registry";

    const requestScope = nock(registryUrl, {
        reqheaders:{
            "Content-Type": "application/json",
            "X-Magda-Tenant-Id": `${MAGDA_ADMIN_PORTAL_ID}`
        }
    });

    after(() => {
        nock.cleanAll();
    });

    beforeEach(() => {
        tenantsTable.clear();
        let argv = { registryApi: registryUrl };
        setupTenantMode(argv);
        
    });

    it("should make request with correct tenant ID", async () => {
        requestScope
        .get("/tenants")
        .reply(
            200,
            '[{"domainName":"built.in","enabled":true,"id":0}]'
        );
            
        await updateTenants();
    
        expect(tenantsTable.get('built.in').id).to.equal(0)
        expect(tenantsTable.get('built.in').enabled).to.equal(true)
        expect(tenantsTable.size).to.equal(1)
    });

    it("should reload tenants table with enabled tenants only", async () => {
        requestScope
        .get("/tenants")
        .reply(
            200,
            '[ \
                {"domainName":"built.in","enabled":true,"id":0}, \
                {"domainName":"web1.com","enabled":false,"id":1},\
                {"domainName":"web2.com","enabled":true,"id":2}  \
             ]'
        );
            
        await updateTenants();
    
        expect(tenantsTable.size).to.equal(2);
        expect(tenantsTable.get("built.in").id).to.equal(0);
        expect(tenantsTable.get("web1.com")).to.equal(undefined);
        expect(tenantsTable.get("web2.com").id).to.equal(2);
    });

    it("should remove disabled tenants", async () => {
        requestScope
        .get("/tenants")
        .reply(
            200,
            '[ \
                {"domainName":"built.in","enabled":true,"id":0}, \
                {"domainName":"web1.com","enabled":true,"id":1}, \
                {"domainName":"web2.com","enabled":false,"id":2} \
             ]'
        );
        
        const tenant_0 = new Tenant();
        const tenant_1 = new Tenant();
        const tenant_2 = new Tenant();
        tenant_0.id = 0;
        tenant_1.id = 1;
        tenant_2.id = 2;
        tenant_0.enabled = true;
        tenant_1.enabled = true;
        tenant_2.enabled = true;

        tenantsTable.set("built.in", tenant_0);
        tenantsTable.set("web1.com", tenant_1);
        tenantsTable.set("web2.com", tenant_2);

        await updateTenants();
    
        expect(tenantsTable.size).to.equal(2);
        expect(tenantsTable.get("built.in").id).to.equal(0);
        expect(tenantsTable.get("web1.com").id).to.equal(1);
        expect(tenantsTable.get("web2.com")).to.equal(undefined);
    });
});

import setupTenantMode from "../setupTenantMode";
import { expect } from "chai";
import reloadTenants, { tenantsTable } from "../reloadTenants";
import { Tenant } from "@magda/typescript-common/dist/generated/registry/api";
import { MAGDA_TENANT_ID_HEADER } from "@magda/typescript-common/dist/registry/TenantConsts";
import { delay } from "q";

const mockServer = require("mockttp").getLocal();

describe("Test reloadTenants", () => {
    const port = 12345;
    const pathPrefix = "someVersion";
    const tenantsUrl = `/${pathPrefix}/tenants`;

    beforeEach(() => {
        tenantsTable.clear();
        mockServer.start(port);
    });

    afterEach(() => {
        delay(500)
        mockServer.stop();
    });

    it("should make request with correct tenant ID for header MAGDA_TENANT_ID_HEADER", async () => {
        const endpointMock = await mockServer
            .get(tenantsUrl)
            .thenReply(
                200,
                '[{"domainName":"built.in","enabled":true,"id":0}]'
            );

        let argv = { registryApi: `http://localhost:${port}/${pathPrefix}` };
        setupTenantMode(argv);
        await reloadTenants();
        const requests = await endpointMock.getSeenRequests();

        expect(requests.length).to.equal(1);
        // This mock server turns header into lower cases.
        expect(
            requests[0].headers[MAGDA_TENANT_ID_HEADER.toLowerCase()]
        ).to.equal("0");
    });

    it("should reload tenants table with enabled tenants only", () => {
        mockServer
            .get(tenantsUrl)
            .thenReply(
                200,
                '[ \
               {"domainName":"built.in","enabled":true,"id":0}, \
               {"domainName":"web1.com","enabled":false,"id":1},\
               {"domainName":"web2.com","enabled":true,"id":2}  \
            ]'
            )
            .then(() => {
                let argv = {
                    registryApi: `http://localhost:${port}/${pathPrefix}`
                };
                setupTenantMode(argv);
                return reloadTenants();
            })
            .then((_: { _: any }) => {
                expect(tenantsTable.size).to.equal(2);
                expect(tenantsTable.get("built.in").id).to.equal(0);
                expect(tenantsTable.get("web1.com")).to.equal(undefined);
                expect(tenantsTable.get("web2.com").id).to.equal(2);
            });
    });

    it("should remove disabled tenants", () => {
        mockServer
            .get(tenantsUrl)
            .thenReply(
                200,
                '[ \
               {"domainName":"built.in","enabled":true,"id":0}, \
               {"domainName":"web1.com","enabled":true,"id":1}, \
               {"domainName":"web2.com","enabled":false,"id":2} \
            ]'
            )
            .then(() => {
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

                let argv = {
                    registryApi: `http://localhost:${port}/${pathPrefix}`
                };
                setupTenantMode(argv);
                expect(tenantsTable.size).to.equal(3);
                return reloadTenants();
            })
            .then((_: { _: any }) => {
                expect(tenantsTable.size).to.equal(2);
                expect(tenantsTable.get("built.in").id).to.equal(0);
                expect(tenantsTable.get("web1.com").id).to.equal(1);
                expect(tenantsTable.get("web2.com")).to.equal(undefined);
            });
    });
});

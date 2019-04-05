import updateTenants from "../updateTenants";
import setupTenantMode, { tenantsTable } from "../setupTenantMode";
import { expect } from "chai";

const mockServer = require("mockttp").getLocal({ debug: true });

describe("Test updateTenants", () => {
    const port = 12345;
    const pathPrefix = "someVersion";
    const tenantsUrl = `/${pathPrefix}/tenants`;

    beforeEach(() => {
        tenantsTable.clear();
        mockServer.start(port);
    });

    afterEach(() => {
        mockServer.stop();
    });

    it("should make request to the specified url", async () => {
        const endpointMock = await mockServer
            .get(tenantsUrl)
            .thenReply(200, "[]");

        let argv = { registryApi: `http://localhost:${port}/${pathPrefix}` };
        setupTenantMode(argv);
        await updateTenants(1, 0);

        const requests = await endpointMock.getSeenRequests();

        expect(requests.length).to.equal(1);
        expect(requests[0].url).to.equal(tenantsUrl);
    });

    it("should update tenant table with enabled tenants", () =>
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
            .then(async () => {
                let argv = {
                    registryApi: `http://localhost:${port}/${pathPrefix}`
                };
                setupTenantMode(argv);
                return await updateTenants(1, 0);
            })
            .then((_: { _: any }) => {
                expect(tenantsTable.size).to.equal(2);
                expect(tenantsTable.get("built.in").id).to.equal(0);
                expect(tenantsTable.get("web1.com")).to.equal(undefined);
                expect(tenantsTable.get("web2.com").id).to.equal(2);
            }));
});

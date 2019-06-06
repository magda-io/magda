import {} from "mocha";
import * as chai from "chai";
import * as chaiAsPromised from "chai-as-promised";
import AuthorizedTenantClient from "../tenant-api/AuthorizedTenantClient";
import mockTenantDataStore from "./mockTenantDataStore";
import { MAGDA_ADMIN_PORTAL_ID } from "../registry/TenantConsts";
import * as nock from "nock";
import buildJwt from "../session/buildJwt";

chai.use(chaiAsPromised);
const expect = chai.expect;

describe("Test AuthorizedTenantClient.ts", function() {
    const mockTenants = mockTenantDataStore.getTenants();
    const jwtSecret = "a top secret";
    const adminUserId = "an-admin-user"
    const tenantsBaseUrl = "http://tenant.some.where";
    const expectedJwt = buildJwt(jwtSecret, adminUserId);

    const requestScope = nock(tenantsBaseUrl, {
        reqheaders:{
            "X-Magda-Session": `${expectedJwt}`,
            "Content-Type": "application/json",
            "X-Magda-Tenant-Id": `${MAGDA_ADMIN_PORTAL_ID}`
        }
    })

    afterEach(() => {
        nock.cleanAll();
    });

    it("`getTenants()` should return all tenants", async function() {        
        requestScope
        .get("/tenants")
        .reply(200, mockTenants)

        const api = new AuthorizedTenantClient({
            urlStr: tenantsBaseUrl,
            maxRetries: 1,
            secondsBetweenRetries: 1,
            jwtSecret: jwtSecret,
            userId: adminUserId
        });

        const actual = await api.getTenants()
        return expect(actual).to.deep.equal(mockTenants);
    });
});

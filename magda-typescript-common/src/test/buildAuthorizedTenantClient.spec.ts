import {} from "mocha";
import * as sinon from "sinon";
import * as chai from "chai";
import * as chaiAsPromised from "chai-as-promised";
import * as yargs from "yargs";
import addJwtSecretFromEnvVar from "../session/addJwtSecretFromEnvVar";
import mockAuthApiHost from "./mockAuthApiHost";
import AuthorizedTenantClient from "../tenant-api/AuthorizedTenantClient";
import mockTenantDataStore from "./mockTenantDataStore";
import { MAGDA_ADMIN_PORTAL_ID } from "../registry/TenantConsts";
import * as nock from "nock";
import buildJwt from "../session/buildJwt";

chai.use(chaiAsPromised);
const expect = chai.expect;

describe("Test AuthorizedTenantClient.ts", function() {
    const mockTenants = mockTenantDataStore.getTenants();

    const argv = addJwtSecretFromEnvVar(
        yargs
            .config()
            .help()
            .option("authorizationApi", {
                describe: "The base URL of the authorization API.",
                type: "string",
                default: "http://localhost:6104/v0"
            })
            .option("jwtSecret", {
                describe:
                    "The secret to use to sign JSON Web Token (JWT) for authenticated requests.  This can also be specified with the JWT_SECRET environment variable.",
                type: "string",
                default:
                    "the-test-jwt-secret"
            })
            .option("userId", {
                describe:
                    "The user id to use when making authenticated requests to the registry",
                type: "string",
                demand: true,
                default:
                    "the-test-user" || process.env.USER_ID || process.env.npm_package_config_userId
            }).argv
    );

    const mockHost = new mockAuthApiHost(
        argv.authorizationApi,
        argv.jwtSecret,
        argv.userId
    );

    const tenantsBaseUrl = "http://tenant.api";
    const expectedJwt = buildJwt(argv.jwtSecret, argv.userId);

    const requestScope = nock(tenantsBaseUrl, {
        reqheaders:{
            "X-Magda-Session": `${expectedJwt}`,
            "Content-Type": "application/json",
            "X-Magda-Tenant-Id": `${MAGDA_ADMIN_PORTAL_ID}`
        }
    })

    before(function() {
        sinon.stub(console, "error").callsFake(() => {});
        sinon.stub(console, "warn").callsFake(() => {});
        mockHost.start();
    });

    after(function() {
        (console.error as any).restore();
        (console.warn as any).restore();
        mockHost.stop();
    });

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
            jwtSecret: argv.jwtSecret,
            userId: argv.userId
        });

        const actual = await api.getTenants()
        return expect(actual).to.deep.equal(mockTenants);
    });
});

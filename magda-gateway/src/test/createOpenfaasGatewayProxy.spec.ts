import {} from "mocha";
import express from "express";
import { expect } from "chai";
import nock, { Scope } from "nock";
import supertest from "supertest";
import randomstring from "randomstring";
import createOpenfaasGatewayProxy from "../createOpenfaasGatewayProxy";
import setupTenantMode from "../setupTenantMode";

const adminUserData = {
    id: "00000000-0000-4000-8000-000000000000",
    displayName: "Test Admin User",
    email: "xxxx@xxx.com",
    photoURL: "//www.gravatar.com/avatar/sdfsdfdsfdsfdsfdsfsdfd",
    source: "ckan",
    isAdmin: true,
    orgUnitId: null as string | null,
    roles: [
        {
            id: "00000000-0000-0002-0000-000000000000",
            name: "Authenticated Users",
            permissionIds: [] as string[]
        },
        {
            id: "00000000-0000-0003-0000-000000000000",
            name: "Admin Users",
            permissionIds: []
        }
    ],
    managingOrgUnitIds: [] as string[],
    orgUnit: null as any
};

const nonAdminUserData = {
    id: "00000000-0000-4000-8000-100000000000",
    displayName: "Test Non-Admin User",
    email: "xxxx@xxx.com",
    photoURL: "//www.gravatar.com/avatar/sdfdsfdssf",
    source: "ckan",
    isAdmin: false,
    orgUnitId: null as string | null,
    roles: [
        {
            id: "00000000-0000-0002-0000-000000000000",
            name: "Authenticated Users",
            permissionIds: [] as string[]
        }
    ],
    managingOrgUnitIds: [] as string[],
    orgUnit: null as any
};

describe("Test createOpenfaasGatewayProxy", () => {
    const openfaasGatewayUrl = "http://gateway.openfaas.com";
    let openfaasGatewayScope: Scope;

    const authApiBaseUrl = "http://authApi";
    let authApiScope: Scope;

    const adminUserId = "00000000-0000-4000-8000-000000000000";
    const nonAdminUserId = "00000000-0000-4000-8000-100000000000";

    after(() => {
        nock.cleanAll();
        nock.enableNetConnect();
    });

    before(() => {
        nock.disableNetConnect();
        // Allow localhost connections so we can test local routes and mock servers.
        nock.enableNetConnect("127.0.0.1");

        openfaasGatewayScope = nock(openfaasGatewayUrl).persist();
        openfaasGatewayScope.get(/.*/).reply(200, (uri: string) => ({ uri }));
        openfaasGatewayScope
            .post(/.*/)
            .reply(200, (uri: string, requestBody: any) => ({
                uri,
                requestBody
            }));

        authApiScope = nock(authApiBaseUrl).persist();
        authApiScope
            .get(new RegExp(`/private/users/${adminUserId}`, "i"))
            .reply(200, { ...adminUserData });
        authApiScope
            .get(new RegExp(`/private/users/${nonAdminUserId}`, "i"))
            .reply(200, { ...nonAdminUserData });
    });

    /**
     * Create the test request
     *
     * @param {boolean} allowAdminOnly
     * @param {string} [userId] optional parameter. Specified the authenticated userId. If undefined, indicates user not logged in yet.
     * @returns
     */
    function createTestRequest(allowAdminOnly: boolean, userId?: string) {
        const tenantMode = setupTenantMode({
            enableMultiTenants: false
        });

        const mockAuthenticator: any = {
            applyToRoute: (app: express.Router) => {
                app.use((req, res, next) => {
                    if (typeof userId === "string") {
                        // --- always logged in as user with id `userId`
                        req.user = {
                            id: userId
                        };
                    }
                    next();
                });
            }
        };

        const app: express.Application = express();
        app.use(
            createOpenfaasGatewayProxy({
                gatewayUrl: openfaasGatewayUrl,
                allowAdminOnly: allowAdminOnly,
                baseAuthUrl: authApiBaseUrl,
                apiRouterOptions: {
                    jwtSecret: "test",
                    tenantMode,
                    authenticator: mockAuthenticator,
                    routes: {}
                }
            })
        );

        return supertest(app);
    }

    it("should allow admin users to access openfaas gateway if `allowAdminOnly` = true", async () => {
        const testReq = createTestRequest(true, adminUserId);
        const randomPath = "/" + randomstring.generate();

        let res = await testReq.get(randomPath).expect(200);
        expect(res.body.uri).to.equal(randomPath);

        const randomData = randomstring.generate();
        res = await testReq
            .post(randomPath)
            .send({ data: randomData })
            .expect(200);
        expect(res.body.uri).to.equal(randomPath);
        expect(res.body.requestBody).to.deep.equal({ data: randomData });
    });

    it("should return 401 when a non-admin user to access openfaas gateway and `allowAdminOnly` = true", async () => {
        const testReq = createTestRequest(true, nonAdminUserId);
        const randomPath = "/" + randomstring.generate();

        await testReq.get(randomPath).expect(401);

        const randomData = randomstring.generate();
        await testReq.post(randomPath).send({ data: randomData }).expect(401);
    });

    it("should return 401 when unauthenticated user to access openfaas gateway and `allowAdminOnly` = true", async () => {
        const testReq = createTestRequest(true, undefined);
        const randomPath = "/" + randomstring.generate();

        await testReq.get(randomPath).expect(401);

        const randomData = randomstring.generate();
        await testReq.post(randomPath).send({ data: randomData }).expect(401);
    });

    it("should allow Non-admin users to access openfaas gateway if `allowAdminOnly` = false", async () => {
        const testReq = createTestRequest(false, nonAdminUserId);
        const randomPath = "/" + randomstring.generate();

        let res = await testReq.get(randomPath).expect(200);
        expect(res.body.uri).to.equal(randomPath);

        const randomData = randomstring.generate();
        res = await testReq
            .post(randomPath)
            .send({ data: randomData })
            .expect(200);
        expect(res.body.uri).to.equal(randomPath);
        expect(res.body.requestBody).to.deep.equal({ data: randomData });
    });

    it("should allow unauthenticated users to access openfaas gateway if `allowAdminOnly` = false", async () => {
        const testReq = createTestRequest(false, undefined);
        const randomPath = "/" + randomstring.generate();

        let res = await testReq.get(randomPath).expect(200);
        expect(res.body.uri).to.equal(randomPath);

        const randomData = randomstring.generate();
        res = await testReq
            .post(randomPath)
            .send({ data: randomData })
            .expect(200);
        expect(res.body.uri).to.equal(randomPath);
        expect(res.body.requestBody).to.deep.equal({ data: randomData });
    });
});

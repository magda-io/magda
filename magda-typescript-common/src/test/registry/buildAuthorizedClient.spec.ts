import {} from "mocha";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import nock from "nock";
import AuthorizedRegistryClient from "magda-typescript-common/src/registry/AuthorizedRegistryClient";

chai.use(chaiAsPromised);
const expect = chai.expect;

describe("Test AuthorizedRegistryClient.ts", function () {
    afterEach(() => {
        nock.cleanAll();
    });

    it("accepts userId and jwtSecret", async function () {
        const registry = new AuthorizedRegistryClient({
            baseUrl: "some.where",
            userId: "some.user",
            jwtSecret: "some.jwt.token",
            tenantId: 0
        });
        expect(registry !== undefined);
    });

    it("rejects null jwt secret if userId is defined", async function () {
        expect(function () {
            new AuthorizedRegistryClient({
                baseUrl: "some.where",
                userId: "some.user",
                jwtSecret: null,
                tenantId: 0
            });
        }).to.throw(Error, "JWT secret can not be null.");
    });

    it("accepts jwt", async function () {
        const registry = new AuthorizedRegistryClient({
            baseUrl: "some.where",
            jwt: "some.jwt.token",
            tenantId: 0
        });
        expect(registry !== undefined);
    });

    it("rejects null jwt", async function () {
        expect(function () {
            new AuthorizedRegistryClient({
                baseUrl: "some.where",
                jwt: null,
                tenantId: 0
            });
        }).to.throw(Error, "jwt can not be null.");
    });
});

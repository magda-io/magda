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
            jwtSecret: "top secret",
            tenantId: 0
        });
        expect(registry !== undefined);
    });

    it("rejects null or empty of userId and jwtSecret", async function () {
        expect(function () {
            new AuthorizedRegistryClient({
                baseUrl: "some.where",
                userId: null,
                jwtSecret: "top secret",
                tenantId: 0
            });
        }).to.throw(
            Error,
            "userId must be supplied when jwtSecret is supplied."
        );

        expect(function () {
            new AuthorizedRegistryClient({
                baseUrl: "some.where",
                userId: "some.user",
                jwtSecret: null,
                tenantId: 0
            });
        }).to.throw(
            Error,
            "jwtSecret must be supplied when userId is supplied."
        );

        // when all userId, jwtSecret & jwt are not provided, the client will act as an anonymous user
        expect(function () {
            new AuthorizedRegistryClient({
                baseUrl: "some.where",
                userId: null,
                jwtSecret: null,
                tenantId: 0
            });
        }).to.not.throw();

        expect(function () {
            new AuthorizedRegistryClient({
                baseUrl: "some.where",
                userId: "some.user",
                jwtSecret: "",
                tenantId: 0
            });
        }).to.throw(
            Error,
            "jwtSecret must be supplied when userId is supplied."
        );
    });

    it("accepts jwt", async function () {
        const registry = new AuthorizedRegistryClient({
            baseUrl: "some.where",
            jwt: "some.jwt.token",
            tenantId: 0
        });
        expect(registry !== undefined);
    });

    it("should not reject null or empty jwt and act as an anonymous user instead", async function () {
        // when all userId, jwtSecret & jwt are not provided, the client will act as an anonymous user
        expect(function () {
            new AuthorizedRegistryClient({
                baseUrl: "some.where",
                jwt: null,
                tenantId: 0
            });
        }).not.to.throw();

        expect(function () {
            new AuthorizedRegistryClient({
                baseUrl: "some.where",
                jwt: "",
                tenantId: 0
            });
        }).not.to.throw();
    });
});

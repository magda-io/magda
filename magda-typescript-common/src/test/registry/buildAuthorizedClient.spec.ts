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

    it("rejects null, empty or pure spaces of userId and jwtSecret", async function () {
        expect(function () {
            new AuthorizedRegistryClient({
                baseUrl: "some.where",
                userId: null,
                jwtSecret: "top secret",
                tenantId: 0
            });
        }).to.throw(
            Error,
            "userId or jwtSecret must be both provided when jwt doesn't present!"
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
            "userId or jwtSecret must be both provided when jwt doesn't present!"
        );

        expect(function () {
            new AuthorizedRegistryClient({
                baseUrl: "some.where",
                userId: null,
                jwtSecret: null,
                tenantId: 0
            });
        }).to.throw(
            Error,
            "userId or jwtSecret must be both provided when jwt doesn't present!"
        );

        expect(function () {
            new AuthorizedRegistryClient({
                baseUrl: "some.where",
                userId: "some.user",
                jwtSecret: "",
                tenantId: 0
            });
        }).to.throw(
            Error,
            "userId or jwtSecret must be both provided when jwt doesn't present!"
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

    it("rejects null, empty jwt", async function () {
        expect(function () {
            new AuthorizedRegistryClient({
                baseUrl: "some.where",
                jwt: null,
                tenantId: 0
            });
        }).to.throw(
            Error,
            "userId or jwtSecret must be both provided when jwt doesn't present!"
        );
    });
});

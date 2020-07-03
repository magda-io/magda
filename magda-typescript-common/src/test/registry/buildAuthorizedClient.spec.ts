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
            "Either jwt or userId and jwtSecret must have values."
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
            "Either jwt or userId and jwtSecret must have values."
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
            "Either jwt or userId and jwtSecret must have values."
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
            "Either jwt or userId and jwtSecret must have values."
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

    it("rejects null or empty jwt", async function () {
        expect(function () {
            new AuthorizedRegistryClient({
                baseUrl: "some.where",
                jwt: null,
                tenantId: 0
            });
        }).to.throw(
            Error,
            "Either jwt or userId and jwtSecret must have values."
        );

        expect(function () {
            new AuthorizedRegistryClient({
                baseUrl: "some.where",
                jwt: "",
                tenantId: 0
            });
        }).to.throw(
            Error,
            "Either jwt or userId and jwtSecret must have values."
        );
    });
});

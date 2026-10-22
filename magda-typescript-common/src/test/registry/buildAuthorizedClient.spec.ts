import {} from "mocha";
import * as chai from "chai";
import { expect } from "chai";
import chaiAsPromised from "chai-as-promised";
import nock from "nock";
import AuthorizedRegistryClient from "../../../src/registry/AuthorizedRegistryClient.js";
import ServerError from "../../../src/ServerError.js";

chai.use(chaiAsPromised);

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

    describe("putRecord", function () {
        const record = {
            id: "test-record",
            name: "test record",
            aspects: {},
            sourceTag: "test-tag"
        } as any;

        const createClient = () =>
            new AuthorizedRegistryClient({
                baseUrl: "http://registry.example.com",
                jwt: "some.jwt.token",
                maxRetries: 3,
                secondsBetweenRetries: 0,
                tenantId: 0
            });

        it("should not retry when the registry responds with 400", async function () {
            let requestCount = 0;
            nock("http://registry.example.com")
                .put("/records/test-record")
                .times(4)
                .reply(() => {
                    requestCount++;
                    return [400, "invalid record"];
                });

            const result = await createClient().putRecord(record);

            expect(requestCount).to.equal(1);
            expect(result).to.be.an.instanceof(ServerError);
            expect((result as ServerError).statusCode).to.equal(400);
        });

        it("should still retry when the registry responds with 500", async function () {
            let requestCount = 0;
            nock("http://registry.example.com")
                .put("/records/test-record")
                .times(4)
                .reply(() => {
                    requestCount++;
                    return [500, "server error"];
                });

            const result = await createClient().putRecord(record);

            expect(requestCount).to.equal(4);
            expect(result).to.be.an.instanceof(ServerError);
            expect((result as ServerError).statusCode).to.equal(500);
        });

        it("should stop retrying once the registry responds with 400 after a retryable error", async function () {
            const statuses = [500, 400, 400, 400];
            let requestCount = 0;
            nock("http://registry.example.com")
                .put("/records/test-record")
                .times(4)
                .reply(() => [statuses[requestCount++], "error"]);

            const result = await createClient().putRecord(record);

            expect(requestCount).to.equal(2);
            expect((result as ServerError).statusCode).to.equal(400);
        });
    });
});

import { expect } from "chai";
import express from "express";
import supertest from "supertest";
import { createRoutes } from "../api/createApiRouter.js";

function buildApp(
    mockSearch: (params: any) => Promise<any[]>,
    mockRetrieve: (params: any) => Promise<any[]> = async () => [],
    mockSearchAlt: (params: any) => Promise<any[]> = mockSearch
) {
    const mockSemanticSearchService = {
        search: mockSearch,
        searchAlt: mockSearchAlt,
        retrieve: mockRetrieve
    } as any;

    const app = express();
    app.use(express.json());
    app.use(
        "/",
        createRoutes(mockSemanticSearchService, {
            jwtSecret: "secret"
        })
    );

    return app;
}

describe("createRoutes /search API", () => {
    const mockResults = [
        {
            id: "1",
            score: 0.9,
            itemType: "storageObject",
            recordId: "record1",
            parentRecordId: "parent1",
            fileFormat: "CSV",
            subObjectId: "sub1",
            subObjectType: "graph",
            text: "some text"
        }
    ];
    const SESSION_HEADER = "X-Magda-Session";
    const TENANT_HEADER = "X-Magda-Tenant-Id";

    it("GET /search should return results and call service.search", async () => {
        let capturedParams: any = null;
        const app = buildApp(async (params) => {
            capturedParams = params;
            return mockResults;
        });

        await supertest(app)
            .get("/search")
            .set(SESSION_HEADER, "mock-jwt-token")
            .set(TENANT_HEADER, "1")
            .query({ query: "test keyword", max_num_results: 50 })
            .expect(200)
            .expect((res) => {
                expect(res.body).to.deep.equal(mockResults);
                expect(capturedParams).to.be.an("object");
                expect(capturedParams.query).to.equal("test keyword");
                expect(capturedParams.max_num_results).to.equal(50);
                expect(capturedParams.jwt).to.equal("mock-jwt-token");
                expect(capturedParams.tenantId).to.equal(1);
            });
    });

    it("POST /search should return results and call service.search", async () => {
        let capturedParams: any = null;
        const app = buildApp(async (params) => {
            capturedParams = params;
            return mockResults;
        });

        await supertest(app)
            .post("/search")
            .set(SESSION_HEADER, "mock-jwt-token-2")
            .set(TENANT_HEADER, "2")
            .send({ query: "another test", max_num_results: 10 })
            .expect(200)
            .expect((res) => {
                expect(res.body).to.deep.equal(mockResults);
                expect(capturedParams.query).to.equal("another test");
                expect(capturedParams.max_num_results).to.equal(10);
                expect(capturedParams.jwt).to.equal("mock-jwt-token-2");
                expect(capturedParams.tenantId).to.equal(2);
            });
    });

    it("should return 400 if query is missing", async () => {
        const app = buildApp(async () => mockResults);

        await supertest(app).get("/search").expect(400);
    });

    it("should return 400 if max_num_results is invalid", async () => {
        const app = buildApp(async () => mockResults);

        await supertest(app)
            .get("/search")
            .query({ query: "test", max_num_results: -1 })
            .expect(400);
    });

    it("should return 400 if minScore is invalid", async () => {
        const app = buildApp(async () => mockResults);

        await supertest(app)
            .get("/search")
            .query({ query: "test", minScore: -0.1 })
            .expect(400);
    });

    it("should return 500 if service.search throws an error", async () => {
        const app = buildApp(async () => {
            throw new Error("test error");
        });

        await supertest(app)
            .get("/search")
            .query({ query: "test", minScore: 1 })
            .expect(500);
    });

    it("GET /searchAlt should return results and call service.searchAlt", async () => {
        let capturedParams: any = null;
        let searchCalled = 0;
        let searchAltCalled = 0;

        const app = buildApp(
            async (_params) => {
                searchCalled++;
                return mockResults;
            },
            async () => [],
            async (params) => {
                searchAltCalled++;
                capturedParams = params;
                return mockResults;
            }
        );

        await supertest(app)
            .get("/searchAlt")
            .set(SESSION_HEADER, "mock-alt-jwt")
            .set(TENANT_HEADER, "11")
            .query({ query: "alt keyword", max_num_results: 20, minScore: 0.3 })
            .expect(200)
            .expect((res) => {
                expect(res.body).to.deep.equal(mockResults);
                expect(capturedParams.query).to.equal("alt keyword");
                expect(capturedParams.max_num_results).to.equal(20);
                expect(capturedParams.minScore).to.equal(0.3);
                expect(capturedParams.jwt).to.equal("mock-alt-jwt");
                expect(capturedParams.tenantId).to.equal(11);
                expect(searchAltCalled).to.equal(1);
                expect(searchCalled).to.equal(0);
            });
    });

    it("POST /searchAlt should return results and call service.searchAlt", async () => {
        let capturedParams: any = null;

        const app = buildApp(
            async () => mockResults,
            async () => [],
            async (params) => {
                capturedParams = params;
                return mockResults;
            }
        );

        await supertest(app)
            .post("/searchAlt")
            .set(SESSION_HEADER, "mock-alt-jwt-2")
            .set(TENANT_HEADER, "22")
            .send({ query: "alt post test", max_num_results: 5 })
            .expect(200)
            .expect((res) => {
                expect(res.body).to.deep.equal(mockResults);
                expect(capturedParams.query).to.equal("alt post test");
                expect(capturedParams.max_num_results).to.equal(5);
                expect(capturedParams.jwt).to.equal("mock-alt-jwt-2");
                expect(capturedParams.tenantId).to.equal(22);
            });
    });

    it("GET /searchAlt should return 400 if query is missing", async () => {
        const app = buildApp(async () => mockResults);
        await supertest(app).get("/searchAlt").expect(400);
    });

    it("GET /searchAlt should return 400 if max_num_results is invalid", async () => {
        const app = buildApp(async () => mockResults);
        await supertest(app)
            .get("/searchAlt")
            .query({ query: "test", max_num_results: -1 })
            .expect(400);
    });

    it("GET /searchAlt should return 400 if minScore is invalid", async () => {
        const app = buildApp(async () => mockResults);
        await supertest(app)
            .get("/searchAlt")
            .query({ query: "test", minScore: -0.1 })
            .expect(400);
    });

    it("GET /searchAlt should return 500 if service.searchAlt throws", async () => {
        const app = buildApp(
            async () => mockResults,
            async () => [],
            async () => {
                throw new Error("searchAlt failed");
            }
        );

        await supertest(app)
            .get("/searchAlt")
            .query({ query: "test" })
            .expect(500);
    });

    it("POST /retrieve should return results and call service.retrieve with jwt and tenantId from headers", async () => {
        let capturedParams: any = null;
        const retrieveResults = [
            { id: "doc1", recordId: "record1", text: "chunk text", score: 0.9 }
        ];

        const app = buildApp(
            async () => mockResults,
            async (params) => {
                capturedParams = params;
                return retrieveResults;
            }
        );

        await supertest(app)
            .post("/retrieve")
            .set(SESSION_HEADER, "mock-retrieve-jwt")
            .set(TENANT_HEADER, "123")
            .send({
                ids: ["doc1", "doc2"],
                mode: "full",
                precedingChunksNum: 1,
                subsequentChunksNum: 2
            })
            .expect(200)
            .expect((res) => {
                expect(res.body).to.deep.equal(retrieveResults);
                expect(capturedParams).to.deep.equal({
                    ids: ["doc1", "doc2"],
                    mode: "full",
                    precedingChunksNum: 1,
                    subsequentChunksNum: 2,
                    jwt: "mock-retrieve-jwt",
                    tenantId: 123
                });
            });
    });

    it("POST /retrieve should pass jwt as undefined and tenantId as 0 when headers are missing", async () => {
        let capturedParams: any = null;

        const app = buildApp(
            async () => mockResults,
            async (params) => {
                capturedParams = params;
                return [];
            }
        );

        await supertest(app)
            .post("/retrieve")
            .send({
                ids: ["doc1"],
                mode: "full",
                precedingChunksNum: 1,
                subsequentChunksNum: 2
            })
            .expect(200)
            .expect(() => {
                expect(capturedParams).to.deep.equal({
                    ids: ["doc1"],
                    mode: "full",
                    precedingChunksNum: 1,
                    subsequentChunksNum: 2,
                    jwt: undefined,
                    tenantId: 0
                });
            });
    });

    it("POST /retrieve should return 400 if ids is missing", async () => {
        const app = buildApp(async () => mockResults);

        await supertest(app)
            .post("/retrieve")
            .send({ mode: "full" })
            .expect(400);
    });

    it("POST /retrieve should return 500 if service.retrieve throws an error", async () => {
        const app = buildApp(
            async () => mockResults,
            async () => {
                throw new Error("retrieve failed");
            }
        );

        await supertest(app)
            .post("/retrieve")
            .send({ ids: ["doc1"], mode: "full" })
            .expect(500);
    });
});

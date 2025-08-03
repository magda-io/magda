import { expect } from "chai";
import express from "express";
import supertest from "supertest";
import { createRoutes } from "../api/createApiRouter.js";

function buildApp(mockSearch: (params: any) => Promise<any[]>) {
    const mockSemanticSearchService = {
        search: mockSearch
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

    it("GET /search should return results and call service.search", async () => {
        let capturedParams: any = null;
        const app = buildApp(async (params) => {
            capturedParams = params;
            return mockResults;
        });

        await supertest(app)
            .get("/search")
            .query({ query: "test keyword", max_num_results: 50 })
            .expect(200)
            .expect((res) => {
                expect(res.body).to.deep.equal(mockResults);
                expect(capturedParams).to.be.an("object");
                expect(capturedParams.query).to.equal("test keyword");
                expect(capturedParams.max_num_results).to.equal(50);
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
            .send({ query: "another test", max_num_results: 10 })
            .expect(200)
            .expect((res) => {
                expect(res.body).to.deep.equal(mockResults);
                expect(capturedParams.query).to.equal("another test");
                expect(capturedParams.max_num_results).to.equal(10);
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
});

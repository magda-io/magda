import { expect } from "chai";
import { buildSearchQueryBody } from "../../service/queryBuilder.js";
import type { SearchParams } from "../../model.js";

describe("QueryBuilder", () => {
    const mockEmbeddingVector = [0.1, 0.2, 0.3, 0.4, 0.5];
    const mockFetchSize = 10;

    describe("buildSearchQueryBody", () => {
        it("should correctly build the basic search query body", () => {
            const searchParams: SearchParams = {
                query: "test query",
                max_num_results: mockFetchSize
            };

            const result = buildSearchQueryBody(
                mockEmbeddingVector,
                searchParams
            );

            expect(result).to.deep.equal({
                size: mockFetchSize,
                query: {
                    knn: {
                        embedding: {
                            vector: mockEmbeddingVector,
                            k: mockFetchSize,
                            min_score: undefined,
                            filter: undefined
                        }
                    }
                },
                _source: {
                    excludes: ["embedding"]
                }
            });
        });

        it("should include multiple filters", () => {
            const searchParams: SearchParams = {
                query: "test query",
                itemType: "storageObject",
                fileFormat: "pdf",
                recordId: "record123",
                max_num_results: mockFetchSize
            };

            const result = buildSearchQueryBody(
                mockEmbeddingVector,
                searchParams
            );

            expect(result.query.knn.embedding.filter).to.deep.equal({
                bool: {
                    must: [
                        { term: { itemType: "storageObject" } },
                        { term: { fileFormat: "pdf" } },
                        { term: { recordId: "record123" } }
                    ]
                }
            });
        });

        it("should use k if instead of min_score if minScore is not provided", () => {
            const searchParams: SearchParams = {
                query: "test query",
                max_num_results: mockFetchSize
            };

            const result = buildSearchQueryBody(
                mockEmbeddingVector,
                searchParams
            );

            expect(result).to.deep.equal({
                size: 10,
                query: {
                    knn: {
                        embedding: {
                            vector: mockEmbeddingVector,
                            min_score: undefined,
                            k: 10,
                            filter: undefined
                        }
                    }
                },
                _source: {
                    excludes: ["embedding"]
                }
            });
        });

        it("should use min_score if instead of k if provided", () => {
            const searchParams: SearchParams = {
                query: "test query",
                minScore: 0.5,
                max_num_results: 10
            };

            const result = buildSearchQueryBody(
                mockEmbeddingVector,
                searchParams
            );

            expect(result).to.deep.equal({
                size: 10,
                query: {
                    knn: {
                        embedding: {
                            vector: mockEmbeddingVector,
                            min_score: 0.5,
                            k: undefined,
                            filter: undefined
                        }
                    }
                },
                _source: {
                    excludes: ["embedding"]
                }
            });
        });
    });
});

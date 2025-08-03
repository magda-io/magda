import { expect } from "chai";
import { buildSearchQueryBody } from "../../service/queryBuilder.js";
import type { SearchParams } from "../../model.js";

describe("QueryBuilder", () => {
    const mockEmbeddingVector = [0.1, 0.2, 0.3, 0.4, 0.5];
    const mockFetchSize = 10;

    describe("buildSearchQueryBody", () => {
        it("should correctly build the basic search query body", () => {
            const searchParams: SearchParams = {
                query: "test query"
            };

            const result = buildSearchQueryBody(
                mockEmbeddingVector,
                searchParams,
                mockFetchSize
            );

            expect(result).to.deep.equal({
                size: mockFetchSize,
                query: {
                    knn: {
                        embedding: {
                            vector: mockEmbeddingVector,
                            k: mockFetchSize,
                            filter: undefined
                        }
                    }
                }
            });
        });

        it("should include multiple filters", () => {
            const searchParams: SearchParams = {
                query: "test query",
                itemType: "document",
                fileFormat: "pdf",
                recordId: "record123"
            };

            const result = buildSearchQueryBody(
                mockEmbeddingVector,
                searchParams,
                mockFetchSize
            );

            expect(result.query.knn.embedding.filter).to.deep.equal({
                bool: {
                    must: [
                        { term: { itemType: "document" } },
                        { term: { fileFormat: "pdf" } },
                        { term: { recordId: "record123" } }
                    ]
                }
            });
        });
    });
});

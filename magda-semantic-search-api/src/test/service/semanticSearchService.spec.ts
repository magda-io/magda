import { expect } from "chai";
import { SemanticSearchService } from "../../service/SemanticSearchService.js";
import type { SearchParams, SemanticIndexerConfig } from "../../model.js";

const returnMockSearchResult = (
    fetchSize: number = undefined,
    minScore: number = undefined
) => {
    let mockHits: any[] = [
        {
            _id: "doc1",
            _score: 0.95,
            _source: {
                itemType: "storegeObject",
                recordId: "record1",
                parentRecordId: "parent1",
                fileFormat: "PDF",
                subObjectId: "sub1",
                subObjectType: "graph",
                text: "test text 1",
                only_one_index_text_chunk: true,
                index_text_chunk_length: 200,
                index_text_chunk_position: 0,
                index_text_chunk_overlap: 50
            }
        },
        {
            _id: "doc2",
            _score: 0.85,
            _source: {
                itemType: "storegeObject",
                recordId: "record2",
                parentRecordId: "parent2",
                fileFormat: "CSV",
                subObjectId: "sub2",
                subObjectType: "graph",
                text: "test text 2",
                only_one_index_text_chunk: false,
                index_text_chunk_length: 150,
                index_text_chunk_position: 10,
                index_text_chunk_overlap: 0
            }
        },
        {
            _id: "doc3",
            _score: 0.75,
            _source: {
                itemType: "storegeObject",
                recordId: "record3",
                parentRecordId: "parent3",
                fileFormat: "CSV",
                subObjectId: "sub3",
                subObjectType: "graph",
                text: "test text 3",
                only_one_index_text_chunk: false,
                index_text_chunk_length: 150,
                index_text_chunk_position: 10,
                index_text_chunk_overlap: 0
            }
        }
    ];

    if (minScore) {
        mockHits = mockHits.filter((result) => result._score >= minScore);
    }

    if (fetchSize) {
        mockHits = mockHits.slice(0, fetchSize);
    }

    return {
        body: {
            hits: {
                hits: mockHits
            }
        }
    };
};

describe("SemanticSearchService", () => {
    let semanticSearchService: SemanticSearchService;
    let mockEmbeddingApiClient: any;
    let mockOpenSearchClient: any;
    let mockSemanticIndexerConfig: SemanticIndexerConfig;

    beforeEach(() => {
        mockEmbeddingApiClient = {
            get: async (query: string) => [0.1, 0.2, 0.3, 0.4, 0.5]
        };

        mockOpenSearchClient = {
            search: async (indexName: string, queryBody: any) => {
                const max_num_results = queryBody.size;
                const min_score = queryBody.query.knn.embedding.min_score;
                return returnMockSearchResult(max_num_results, min_score);
            }
        };

        mockSemanticIndexerConfig = {
            indexName: "test-index",
            indexVersion: 1,
            mode: "in_memory"
        };

        semanticSearchService = new SemanticSearchService(
            mockEmbeddingApiClient,
            mockOpenSearchClient,
            mockSemanticIndexerConfig
        );
    });

    describe("search", () => {
        it("should successfully execute search and return top-k results", async () => {
            const searchParams: SearchParams = {
                query: "test query",
                max_num_results: 2,
                minScore: 0.5
            };

            const result = await semanticSearchService.search(searchParams);

            expect(result).to.be.an("array");
            expect(result).to.have.length(2);
            expect(result[0].score).to.equal(0.95);
            expect(result[1].score).to.equal(0.85);
        });

        it("should use doubled max_num_results and then apply minScore filter in on_disk mode", async () => {
            mockSemanticIndexerConfig.mode = "on_disk";
            const max_num_results = 1;
            mockOpenSearchClient = {
                search: async (indexName: string, queryBody: any) => {
                    // should query two times of max_num_results
                    const size = queryBody.size;
                    const min_score = queryBody.query.knn.embedding.min_score;
                    const k = queryBody.query.knn.embedding.k;
                    expect(size).to.equal(max_num_results * 2);
                    expect(min_score).to.be.undefined;
                    expect(k).to.equal(max_num_results * 2);
                    return returnMockSearchResult(size, min_score);
                }
            };
            semanticSearchService = new SemanticSearchService(
                mockEmbeddingApiClient,
                mockOpenSearchClient,
                mockSemanticIndexerConfig
            );

            const searchParams: SearchParams = {
                query: "test query",
                max_num_results: max_num_results,
                minScore: 0.8
            };

            const result = await semanticSearchService.search(searchParams);

            expect(result).to.have.length(1);
            expect(result[0].score).to.equal(0.95);
        });
    });
});

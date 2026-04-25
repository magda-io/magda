import { expect } from "chai";
import { SemanticSearchService } from "../../service/SemanticSearchService.js";
import type {
    RetrieveParams,
    SearchParams,
    SemanticIndexerConfig
} from "../../model.js";
import type {
    SearchDatasetsParams,
    SearchDatasetsResult,
    SearchDataset
} from "magda-typescript-common/src/SearchApiClient.js";

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

const returnMockFilterRecordsByAccessResult = (
    records: string[] = []
): string[] => records;

type MockDatasetInput = {
    identifier?: string;
    distributions?: Array<{ identifier?: string }>;
};

const returnMockSearchDatasetsResult = (
    datasets: MockDatasetInput[] = []
): SearchDatasetsResult => {
    const dataSets: SearchDataset[] = datasets.map((d) => ({
        identifier: d.identifier,
        distributions: (d.distributions ?? []).map((dist) => ({
            identifier: dist.identifier
        }))
    }));

    return {
        hitCount: dataSets.length,
        dataSets
    };
};

describe("SemanticSearchService.search", () => {
    let semanticSearchService: SemanticSearchService;
    let mockEmbeddingApiClient: any;
    let mockOpenSearchClient: any;
    let mockRegistryClient: any;
    let mockSearchApiClient: any;
    let mockRedisClient: any;
    let mockSemanticIndexerConfig: SemanticIndexerConfig;

    beforeEach(() => {
        mockEmbeddingApiClient = {
            get: async (_query: string) => [0.1, 0.2, 0.3, 0.4, 0.5]
        };

        mockOpenSearchClient = {
            search: async (indexName: string, queryBody: any) => {
                const max_num_results = queryBody.size;
                const min_score = queryBody.query.knn.embedding.min_score;
                return returnMockSearchResult(max_num_results, min_score);
            }
        };

        mockRegistryClient = {
            filterRecordsByAccess: async (
                _records: string[],
                _jwtToken?: string,
                _tenantId?: number
            ): Promise<string[]> => {
                return returnMockFilterRecordsByAccessResult([
                    "record1",
                    "record2"
                ]);
            }
        };

        mockSearchApiClient = {
            searchDatasets: async (
                _params: SearchDatasetsParams = {},
                _jwtToken?: string,
                _tenantId?: number
            ): Promise<SearchDatasetsResult> => {
                return returnMockSearchDatasetsResult([]);
            }
        };

        mockRedisClient = {
            get: async (_key: string): Promise<string | null> =>
                JSON.stringify(["record1", "record2", "record3"])
        };

        mockSemanticIndexerConfig = {
            indexName: "test-index",
            indexVersion: 1,
            mode: "in_memory"
        };

        semanticSearchService = new SemanticSearchService(
            mockEmbeddingApiClient,
            mockOpenSearchClient,
            mockRegistryClient,
            mockSearchApiClient,
            mockRedisClient,
            mockSemanticIndexerConfig
        );
    });

    describe("search", () => {
        it("should use versioned index name when querying OpenSearch", async () => {
            const usedIndexNames: string[] = [];

            mockOpenSearchClient = {
                search: async (indexName: string, queryBody: any) => {
                    usedIndexNames.push(indexName);
                    const max_num_results = queryBody.size;
                    const min_score = queryBody.query.knn.embedding.min_score;
                    return returnMockSearchResult(max_num_results, min_score);
                }
            };

            semanticSearchService = new SemanticSearchService(
                mockEmbeddingApiClient,
                mockOpenSearchClient,
                mockRegistryClient,
                mockSearchApiClient,
                mockRedisClient,
                mockSemanticIndexerConfig
            );

            await semanticSearchService.search({
                query: "test query",
                max_num_results: 1
            });

            expect(usedIndexNames[0]).to.equal("test-index-v1");
        });

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
                mockRegistryClient,
                mockSearchApiClient,
                mockRedisClient,
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

        it("should keep only records allowed by filterRecordsByAccess", async () => {
            let searchDatasetsCallCount = 0;

            mockRegistryClient = {
                filterRecordsByAccess: async (
                    _records: string[],
                    _jwtToken?: string,
                    _tenantId?: number
                ): Promise<string[]> => {
                    return returnMockFilterRecordsByAccessResult([
                        "record1",
                        "record2"
                    ]);
                }
            };

            mockSearchApiClient = {
                searchDatasets: async (
                    _params: SearchDatasetsParams = {},
                    _jwtToken?: string,
                    _tenantId?: number
                ): Promise<SearchDatasetsResult> => {
                    searchDatasetsCallCount++;
                    return returnMockSearchDatasetsResult([]);
                }
            };

            // Mode is irrelevant here; always return fixed records record1/2/3.
            mockOpenSearchClient = {
                search: async (_indexName: string, _queryBody: any) => {
                    return returnMockSearchResult(3, undefined);
                }
            };

            semanticSearchService = new SemanticSearchService(
                mockEmbeddingApiClient,
                mockOpenSearchClient,
                mockRegistryClient,
                mockSearchApiClient,
                mockRedisClient,
                mockSemanticIndexerConfig
            );

            const result = await semanticSearchService.search({
                query: "test query",
                max_num_results: 3
            });

            expect(result).to.have.length(2);
            expect(result.map((r) => r.recordId)).to.have.members([
                "record1",
                "record2"
            ]);
            expect(searchDatasetsCallCount).to.equal(0); // Phase 1 has results, so Phase 2 should not run.
        });

        it("should fallback to searchDatasets when phase 1 returns empty and re-search by returned recordIds", async () => {
            let openSearchCallCount = 0;
            let searchDatasetsCallCount = 0;

            mockRegistryClient = {
                filterRecordsByAccess: async (
                    _records: string[],
                    _jwtToken?: string,
                    _tenantId?: number
                ): Promise<string[]> => {
                    // When the first vector search is empty, this receives [].
                    return returnMockFilterRecordsByAccessResult([]);
                }
            };

            mockSearchApiClient = {
                searchDatasets: async (
                    params: SearchDatasetsParams = {},
                    jwtToken?: string,
                    _tenantId?: number
                ): Promise<SearchDatasetsResult> => {
                    searchDatasetsCallCount++;
                    expect(params).to.deep.equal({
                        query: "test query",
                        start: 0,
                        limit: 500
                    });
                    expect(jwtToken).to.equal("mock-jwt");
                    return returnMockSearchDatasetsResult([
                        {
                            identifier: "record1",
                            distributions: [{ identifier: "record2" }]
                        }
                    ]);
                }
            };

            mockOpenSearchClient = {
                search: async (_indexName: string, queryBody: any) => {
                    openSearchCallCount++;

                    if (openSearchCallCount === 1) {
                        // Phase 1 vector search returns empty and triggers fallback.
                        return { body: { hits: { hits: [] as any[] } } };
                    }

                    // Phase 2 should include a terms filter on recordId.
                    const mustClauses =
                        queryBody?.query?.knn?.embedding?.filter?.bool?.must ??
                        [];
                    const termsClause = mustClauses.find(
                        (c: any) => c.terms?.recordId
                    );
                    expect(termsClause).to.exist;
                    expect(termsClause.terms.recordId).to.have.members([
                        "record1",
                        "record2"
                    ]);

                    // Return second-pass vector search results.
                    return {
                        body: {
                            hits: {
                                hits: [
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
                                    }
                                ]
                            }
                        }
                    };
                }
            };

            semanticSearchService = new SemanticSearchService(
                mockEmbeddingApiClient,
                mockOpenSearchClient,
                mockRegistryClient,
                mockSearchApiClient,
                mockRedisClient,
                mockSemanticIndexerConfig
            );

            const result = await semanticSearchService.search({
                query: "test query",
                jwt: "mock-jwt"
            });

            expect(openSearchCallCount).to.equal(2);
            expect(searchDatasetsCallCount).to.equal(1);
            expect(result).to.have.length(2);
            expect(result.map((r) => r.recordId)).to.have.members([
                "record1",
                "record2"
            ]);
        });

        it("should fallback to phase 2 when phase 1 hits are all filtered out by access control", async () => {
            let openSearchCallCount = 0;
            let searchDatasetsCallCount = 0;
            let filterRecordsCallCount = 0;
            let capturedPhase1RecordIds: string[] = [];

            mockOpenSearchClient = {
                search: async (_indexName: string, queryBody: any) => {
                    openSearchCallCount++;

                    if (openSearchCallCount === 1) {
                        // Phase 1 has hits: record1/2/3
                        return returnMockSearchResult(3, undefined);
                    }

                    // Phase 2 should include recordId terms filter from searchDatasets
                    const mustClauses =
                        queryBody?.query?.knn?.embedding?.filter?.bool?.must ??
                        [];
                    const termsClause = mustClauses.find(
                        (c: any) => c.terms?.recordId
                    );

                    expect(termsClause).to.exist;
                    expect(termsClause.terms.recordId).to.have.members([
                        "record4",
                        "record5"
                    ]);

                    return {
                        body: {
                            hits: {
                                hits: [
                                    {
                                        _id: "doc1",
                                        _score: 0.9,
                                        _source: {
                                            itemType: "storageObject",
                                            recordId: "record4",
                                            index_text_chunk: "x",
                                            only_one_index_text_chunk: true,
                                            index_text_chunk_length: 1,
                                            index_text_chunk_position: 0,
                                            index_text_chunk_overlap: 0
                                        }
                                    },
                                    {
                                        _id: "doc2",
                                        _score: 0.8,
                                        _source: {
                                            itemType: "storageObject",
                                            recordId: "record5",
                                            index_text_chunk: "y",
                                            only_one_index_text_chunk: true,
                                            index_text_chunk_length: 1,
                                            index_text_chunk_position: 1,
                                            index_text_chunk_overlap: 0
                                        }
                                    }
                                ]
                            }
                        }
                    };
                }
            };

            mockRegistryClient = {
                filterRecordsByAccess: async (
                    records: string[],
                    _jwtToken?: string,
                    _tenantId?: number
                ): Promise<string[]> => {
                    filterRecordsCallCount++;
                    capturedPhase1RecordIds = records;
                    // Deny all phase-1 records -> force fallback
                    return returnMockFilterRecordsByAccessResult([]);
                }
            };

            mockSearchApiClient = {
                searchDatasets: async (
                    _params: SearchDatasetsParams = {},
                    _jwtToken?: string,
                    _tenantId?: number
                ): Promise<SearchDatasetsResult> => {
                    searchDatasetsCallCount++;
                    return returnMockSearchDatasetsResult([
                        { identifier: "record4" },
                        { distributions: [{ identifier: "record5" }] }
                    ]);
                }
            };

            semanticSearchService = new SemanticSearchService(
                mockEmbeddingApiClient,
                mockOpenSearchClient,
                mockRegistryClient,
                mockSearchApiClient,
                mockRedisClient,
                mockSemanticIndexerConfig
            );

            const result = await semanticSearchService.search({
                query: "test query"
            });

            // verify phase-1 access filtering actually happened
            expect(filterRecordsCallCount).to.equal(1);
            expect(capturedPhase1RecordIds).to.have.members([
                "record1",
                "record2",
                "record3"
            ]);

            // verify fallback phase-2 happened
            expect(searchDatasetsCallCount).to.equal(1);
            expect(openSearchCallCount).to.equal(2);

            expect(result.map((r) => r.recordId)).to.have.members([
                "record4",
                "record5"
            ]);
        });

        it("should dedupe and drop empty recordIds before filterRecordsByAccess", async () => {
            let capturedRecordIds: string[] = [];
            let searchDatasetsCallCount = 0;

            mockOpenSearchClient = {
                search: async () => ({
                    body: {
                        hits: {
                            hits: [
                                {
                                    _id: "doc1",
                                    _score: 0.95,
                                    _source: {
                                        itemType: "storageObject",
                                        recordId: "record1",
                                        index_text_chunk: "chunk-1",
                                        only_one_index_text_chunk: true,
                                        index_text_chunk_length: 10,
                                        index_text_chunk_position: 0,
                                        index_text_chunk_overlap: 0
                                    }
                                },
                                {
                                    _id: "doc2",
                                    _score: 0.85,
                                    _source: {
                                        itemType: "storageObject",
                                        recordId: "record1", // duplicate
                                        index_text_chunk: "chunk-2",
                                        only_one_index_text_chunk: true,
                                        index_text_chunk_length: 10,
                                        index_text_chunk_position: 10,
                                        index_text_chunk_overlap: 0
                                    }
                                },
                                {
                                    _id: "doc3",
                                    _score: 0.75,
                                    _source: {
                                        itemType: "storageObject",
                                        // no recordId
                                        index_text_chunk: "chunk-3",
                                        only_one_index_text_chunk: true,
                                        index_text_chunk_length: 10,
                                        index_text_chunk_position: 20,
                                        index_text_chunk_overlap: 0
                                    }
                                }
                            ]
                        }
                    }
                })
            };

            mockRegistryClient = {
                filterRecordsByAccess: async (
                    records: string[],
                    _jwtToken?: string,
                    _tenantId?: number
                ): Promise<string[]> => {
                    capturedRecordIds = records;
                    return returnMockFilterRecordsByAccessResult(["record1"]);
                }
            };

            mockSearchApiClient = {
                searchDatasets: async (): Promise<SearchDatasetsResult> => {
                    searchDatasetsCallCount++;
                    return returnMockSearchDatasetsResult([]);
                }
            };

            semanticSearchService = new SemanticSearchService(
                mockEmbeddingApiClient,
                mockOpenSearchClient,
                mockRegistryClient,
                mockSearchApiClient,
                mockRedisClient,
                mockSemanticIndexerConfig
            );

            const result = await semanticSearchService.search({
                query: "test query"
            });

            expect(capturedRecordIds).to.deep.equal(["record1"]);
            expect(result).to.have.length(2);
            expect(result.every((r) => r.recordId === "record1")).to.equal(
                true
            );
            expect(searchDatasetsCallCount).to.equal(0);
        });

        it("should return empty when fallback datasets contain no valid identifiers", async () => {
            let openSearchCallCount = 0;
            let searchDatasetsCallCount = 0;

            mockOpenSearchClient = {
                search: async (_indexName: string, _queryBody: any) => {
                    openSearchCallCount++;
                    // Phase 1 returns no vector hits
                    return { body: { hits: { hits: [] as any[] } } };
                }
            };

            mockRegistryClient = {
                filterRecordsByAccess: async (
                    records: string[],
                    _jwtToken?: string,
                    _tenantId?: number
                ): Promise<string[]> => {
                    // Ensure Phase 1 recordIds are empty
                    expect(records).to.deep.equal([]);
                    return returnMockFilterRecordsByAccessResult([]);
                }
            };

            mockSearchApiClient = {
                searchDatasets: async (): Promise<SearchDatasetsResult> => {
                    searchDatasetsCallCount++;
                    // Empty string identifiers should be ignored by truthy checks
                    return returnMockSearchDatasetsResult([
                        { identifier: "" }, // falsy identifier
                        {} // distributions is undefined -> hit `?? []`
                    ]);
                }
            };

            semanticSearchService = new SemanticSearchService(
                mockEmbeddingApiClient,
                mockOpenSearchClient,
                mockRegistryClient,
                mockSearchApiClient,
                mockRedisClient,
                mockSemanticIndexerConfig
            );

            const result = await semanticSearchService.search({
                query: "test query",
                jwt: "mock-jwt"
            });

            expect(result).to.deep.equal([]);
            expect(searchDatasetsCallCount).to.equal(1);
            // No Phase 2 vector re-search should happen
            expect(openSearchCallCount).to.equal(1);
        });

        it("searchAlt should query by accessible record ids from redis cache", async () => {
            let capturedTerms: string[] = [];

            mockRegistryClient = {
                getAccessibleIdsCacheKey: async (
                    _jwtToken?: string,
                    _tenantId?: number
                ) => "cache-key-1"
            };

            mockRedisClient = {
                get: async (key: string): Promise<string | null> => {
                    expect(key).to.equal("cache-key-1");
                    return JSON.stringify(["record1", "record2"]);
                }
            };

            mockOpenSearchClient = {
                search: async (_indexName: string, queryBody: any) => {
                    const mustClauses =
                        queryBody?.query?.knn?.embedding?.filter?.bool?.must ??
                        [];
                    const termsClause = mustClauses.find(
                        (c: any) => c.terms?.recordId
                    );
                    capturedTerms = termsClause?.terms?.recordId ?? [];
                    return returnMockSearchResult(3, undefined);
                }
            };

            semanticSearchService = new SemanticSearchService(
                mockEmbeddingApiClient,
                mockOpenSearchClient,
                mockRegistryClient,
                mockSearchApiClient,
                mockRedisClient,
                mockSemanticIndexerConfig
            );

            const result = await semanticSearchService.searchAlt({
                query: "test query",
                jwt: "mock-jwt",
                tenantId: 0,
                max_num_results: 3
            });

            expect(capturedTerms).to.have.members(["record1", "record2"]);
            expect(result.length).to.be.greaterThan(0);
        });

        it("searchAlt should fallback to default search when cache key lookup fails", async () => {
            let openSearchCallCount = 0;

            mockRegistryClient = {
                getAccessibleIdsCacheKey: async () => ({ message: "failed" }),
                filterRecordsByAccess: async (
                    records: string[],
                    _jwtToken: string,
                    _tenantId?: number
                ): Promise<string[]> => records
            };

            mockOpenSearchClient = {
                search: async (_indexName: string, queryBody: any) => {
                    openSearchCallCount++;
                    return returnMockSearchResult(queryBody.size, undefined);
                }
            };

            semanticSearchService = new SemanticSearchService(
                mockEmbeddingApiClient,
                mockOpenSearchClient,
                mockRegistryClient,
                mockSearchApiClient,
                mockRedisClient,
                mockSemanticIndexerConfig
            );

            const result = await semanticSearchService.searchAlt({
                query: "test query",
                max_num_results: 2
            });

            expect(openSearchCallCount).to.equal(1);
            expect(result).to.have.length(2);
        });

        it("searchAlt should return empty when redis has no accessible ids", async () => {
            mockRegistryClient = {
                getAccessibleIdsCacheKey: async () => "cache-key-2"
            };
            mockRedisClient = {
                get: async (): Promise<string | null> => JSON.stringify([])
            };

            semanticSearchService = new SemanticSearchService(
                mockEmbeddingApiClient,
                mockOpenSearchClient,
                mockRegistryClient,
                mockSearchApiClient,
                mockRedisClient,
                mockSemanticIndexerConfig
            );

            const result = await semanticSearchService.searchAlt({
                query: "test query"
            });

            expect(result).to.deep.equal([]);
        });
    });
});

const ORIGINAL_TEXT =
    "chunk-1 [overlap],chunk-2 [overlap],chunk-3 [overlap],chunk-4 [overlap],chunk-5";

const mockRetrieveIndexItemsResponse = (ids: string[]) => ({
    body: {
        hits: {
            hits: ids
                .map((id, idx) => {
                    if (id === "NoSuchDoc") {
                        return null;
                    }
                    const recordId = id.includes("-")
                        ? id.split("-")[0]
                        : `record${idx + 1}`;
                    return {
                        _id: id,
                        _source: {
                            recordId,
                            parentRecordId: `parent${idx + 1}`,
                            itemType: "storageObject",
                            fileFormat: idx === 0 ? "PDF" : "CSV",
                            index_text_chunk: `placeholder ${idx + 1}`,
                            only_one_index_text_chunk: true,
                            index_text_chunk_length: 1,
                            index_text_chunk_position: 0,
                            index_text_chunk_overlap: 0
                        }
                    };
                })
                .filter((item) => item !== null)
        }
    }
});

const mockRetrieveChunksResponse = (recordId: string) => {
    const chunks = [
        "chunk-1 [overlap],",
        "[overlap],chunk-2 [overlap],",
        "[overlap],chunk-3 [overlap],",
        "[overlap],chunk-4 [overlap],",
        "[overlap],chunk-5"
    ];

    const hits = chunks.map((c, idx) => ({
        _id: `${recordId}-chunk${idx + 1}`,
        _source: {
            index_text_chunk: c,
            only_one_index_text_chunk: false,
            index_text_chunk_length: c.length,
            index_text_chunk_position: ORIGINAL_TEXT.indexOf(c),
            index_text_chunk_overlap: 10
        }
    }));

    return { body: { hits: { hits } } };
};

describe("SemanticSearchService.retrieve", () => {
    let service: SemanticSearchService;
    let mockOpenSearchClient: any;
    let mockEmbeddingApiClient: any;
    let mockRegistryClient: any;
    let mockSearchApiClient: any;
    let mockRedisClient: any;
    let cfg: SemanticIndexerConfig;

    beforeEach(() => {
        mockEmbeddingApiClient = { get: async () => [0.1] };

        mockRegistryClient = {
            filterRecordsByAccess: async (
                records: string[],
                _jwtToken?: string,
                _tenantId?: number
            ): Promise<string[]> => {
                return returnMockFilterRecordsByAccessResult(records);
            }
        };

        mockSearchApiClient = {
            searchDatasets: async (): Promise<SearchDatasetsResult> => {
                return returnMockSearchDatasetsResult([]);
            }
        };

        mockRedisClient = {
            get: async (_key: string): Promise<string | null> => null
        };

        let call = 0;
        mockOpenSearchClient = {
            search: async (_idx: string, body: any) => {
                call++;
                if (call === 1) {
                    return mockRetrieveIndexItemsResponse(
                        body.query.ids.values
                    );
                }
                const recordId = body.query.bool.should.find(
                    (t: any) => t.term?.recordId
                ).term.recordId;
                return mockRetrieveChunksResponse(recordId);
            }
        };

        cfg = { indexName: "test-index", indexVersion: 1, mode: "in_memory" };
        service = new SemanticSearchService(
            mockEmbeddingApiClient,
            mockOpenSearchClient,
            mockRegistryClient,
            mockSearchApiClient,
            mockRedisClient,
            cfg
        );
    });

    it("merges all chunks in full mode (single id)", async () => {
        const params: RetrieveParams = { ids: ["doc1"], mode: "full" };
        const res = await service.retrieve(params);
        expect(res).to.have.length(1);
        expect(res[0].text).to.equal(ORIGINAL_TEXT);
    });

    it("merges all chunks in full mode (multiple ids)", async () => {
        const params: RetrieveParams = { ids: ["doc1", "doc2"], mode: "full" };
        const res = await service.retrieve(params);
        expect(res).to.have.length(2);
        res.forEach((r) => expect(r.text).to.equal(ORIGINAL_TEXT));
    });

    it("should only return partial result when some documents don't exist", async () => {
        const params: RetrieveParams = {
            ids: ["doc1", "NoSuchDoc", "NoSuchDoc", "doc4"],
            mode: "full"
        };
        const res = await service.retrieve(params);
        expect(res).to.have.length(2);
        res.forEach((r) => expect(r.text).to.equal(ORIGINAL_TEXT));
    });

    it("extracts correct window in partial mode", async () => {
        const targetDocId = "record1-chunk3";
        const PARTIAL_TEXT =
            "[overlap],chunk-2 [overlap],chunk-3 [overlap],chunk-4 [overlap],";

        const params: RetrieveParams = {
            ids: [targetDocId],
            mode: "partial",
            precedingChunksNum: 1,
            subsequentChunksNum: 1
        };

        const res = await service.retrieve(params);
        expect(res).to.have.length(1);
        expect(res[0].text).to.equal(PARTIAL_TEXT);
    });

    it("partial mode caps window at dataset boundaries", async () => {
        const params: RetrieveParams = {
            ids: ["record1-chunk1"],
            mode: "partial",
            precedingChunksNum: 2,
            subsequentChunksNum: 2
        };
        const res = await service.retrieve(params);
        expect(res).to.have.length(1);

        const expected =
            "chunk-1 [overlap],chunk-2 [overlap],chunk-3 [overlap],";
        expect(res[0].text).to.equal(expected);
    });

    it("partial mode works for multiple ids", async () => {
        const params: RetrieveParams = {
            ids: ["record1-chunk2", "record2-chunk4"],
            mode: "partial",
            precedingChunksNum: 1,
            subsequentChunksNum: 1
        };
        const res = await service.retrieve(params);
        expect(res).to.have.length(2);
        expect(res[0].text).to.equal(
            "chunk-1 [overlap],chunk-2 [overlap],chunk-3 [overlap],"
        );
        expect(res[1].text).to.equal(
            "[overlap],chunk-3 [overlap],chunk-4 [overlap],chunk-5"
        );
    });

    it("returns empty array when ids list is empty", async () => {
        const params: RetrieveParams = { ids: [], mode: "full" };
        const res = await service.retrieve(params);
        expect(res).to.be.an("array").that.is.empty;
    });

    it("should only return results whose recordIds pass filterRecordsByAccess", async () => {
        mockRegistryClient = {
            filterRecordsByAccess: async (
                records: string[],
                _jwtToken?: string,
                _tenantId?: number
            ): Promise<string[]> => {
                expect(records).to.have.members(["record1", "record2"]);
                return returnMockFilterRecordsByAccessResult(["record1"]);
            }
        };

        mockSearchApiClient = {
            searchDatasets: async (): Promise<SearchDatasetsResult> => {
                return returnMockSearchDatasetsResult([]);
            }
        };

        let call = 0;
        mockOpenSearchClient = {
            search: async (_idx: string, body: any) => {
                call++;
                if (call === 1) {
                    return mockRetrieveIndexItemsResponse(
                        body.query.ids.values
                    );
                }

                const recordId = body.query.bool.should.find(
                    (t: any) => t.term?.recordId
                ).term.recordId;
                expect(recordId).to.equal("record1");
                return mockRetrieveChunksResponse(recordId);
            }
        };

        service = new SemanticSearchService(
            mockEmbeddingApiClient,
            mockOpenSearchClient,
            mockRegistryClient,
            mockSearchApiClient,
            mockRedisClient,
            cfg
        );

        const res = await service.retrieve({
            ids: ["doc1", "doc2"],
            mode: "full"
        });

        expect(res).to.have.length(1);
        expect(res[0].text).to.equal(ORIGINAL_TEXT);
    });

    it("should return empty array when filterRecordsByAccess rejects all records", async () => {
        mockRegistryClient = {
            filterRecordsByAccess: async (
                records: string[],
                _jwtToken?: string,
                _tenantId?: number
            ): Promise<string[]> => {
                expect(records).to.have.members(["record1", "record2"]);
                return returnMockFilterRecordsByAccessResult([]);
            }
        };

        mockSearchApiClient = {
            searchDatasets: async (): Promise<SearchDatasetsResult> => {
                return returnMockSearchDatasetsResult([]);
            }
        };

        let call = 0;
        mockOpenSearchClient = {
            search: async (_idx: string, body: any) => {
                call++;
                if (call === 1) {
                    return mockRetrieveIndexItemsResponse(
                        body.query.ids.values
                    );
                }
                throw new Error(
                    "Phase 2 should not be called when all records are filtered out"
                );
            }
        };

        service = new SemanticSearchService(
            mockEmbeddingApiClient,
            mockOpenSearchClient,
            mockRegistryClient,
            mockSearchApiClient,
            mockRedisClient,
            cfg
        );

        const res = await service.retrieve({
            ids: ["doc1", "doc2"],
            mode: "full"
        });

        expect(res).to.deep.equal([]);
    });
});

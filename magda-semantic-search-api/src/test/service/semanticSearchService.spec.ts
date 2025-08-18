import { expect } from "chai";
import { SemanticSearchService } from "../../service/SemanticSearchService.js";
import type {
    RetrieveParams,
    SearchParams,
    SemanticIndexerConfig
} from "../../model.js";

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

describe("SemanticSearchService.search", () => {
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
    let cfg: SemanticIndexerConfig;

    beforeEach(() => {
        mockEmbeddingApiClient = { get: async () => [0.1] };

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
});

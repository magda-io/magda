import { expect } from "chai";
import { mapSearchResults } from "../../service/resultMapper.js";

describe("ResultMapper", () => {
    describe("mapSearchResults", () => {
        it("should correctly map valid search results", () => {
            const mockResponse = {
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
                                    fileFormat: "pdf",
                                    subObjectId: "sub1",
                                    subObjectType: "graph",
                                    index_text_chunk: "test content",
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
                                    fileFormat: "jpg",
                                    subObjectId: "sub2",
                                    subObjectType: "graph",
                                    index_text_chunk: "image description",
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

            const result = mapSearchResults(mockResponse);

            expect(result).to.have.length(2);
            expect(result[0]).to.deep.equal({
                id: "doc1",
                score: 0.95,
                itemType: "storegeObject",
                recordId: "record1",
                parentRecordId: "parent1",
                fileFormat: "pdf",
                subObjectId: "sub1",
                subObjectType: "graph",
                text: "test content",
                only_one_index_text_chunk: true,
                index_text_chunk_length: 200,
                index_text_chunk_position: 0,
                index_text_chunk_overlap: 50
            });
            expect(result[1]).to.deep.equal({
                id: "doc2",
                score: 0.85,
                itemType: "storegeObject",
                recordId: "record2",
                parentRecordId: "parent2",
                fileFormat: "jpg",
                subObjectId: "sub2",
                subObjectType: "graph",
                text: "image description",
                only_one_index_text_chunk: false,
                index_text_chunk_length: 150,
                index_text_chunk_position: 10,
                index_text_chunk_overlap: 0
            });
        });

        it("should handle missing fields and use default values", () => {
            const mockResponse = {
                body: {
                    hits: {
                        hits: [
                            {
                                _id: "doc1",
                                _score: 0.8,
                                _source: {
                                    index_text_chunk: "test content"
                                }
                            }
                        ]
                    }
                }
            };

            const result = mapSearchResults(mockResponse);

            expect(result).to.have.length(1);
            expect(result[0]).to.deep.equal({
                id: "doc1",
                score: 0.8,
                itemType: undefined,
                recordId: undefined,
                parentRecordId: undefined,
                fileFormat: undefined,
                subObjectId: undefined,
                subObjectType: undefined,
                text: "test content",
                only_one_index_text_chunk: false,
                index_text_chunk_length: 0,
                index_text_chunk_position: 0,
                index_text_chunk_overlap: 0
            });
        });

        it("should handle empty response", () => {
            const result = mapSearchResults(null);
            expect(result).to.be.an("array").that.is.empty;
        });
    });
});

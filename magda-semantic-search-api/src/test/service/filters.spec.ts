import { expect } from "chai";
import { filterByMinScore, keepTopK } from "../../service/filters.js";
import type { SearchResultItem } from "../../model.js";

describe("filters", () => {
    const mockSearchResults: SearchResultItem[] = [
        {
            id: "1",
            score: 0.9,
            itemType: "storegeObject",
            recordId: "record1",
            parentRecordId: "parent1",
            fileFormat: "CSV",
            subObjectId: "sub1",
            subObjectType: "graph",
            text: "test text 1",
            only_one_index_text_chunk: false,
            index_text_chunk_length: 100,
            index_text_chunk_position: 0,
            index_text_chunk_overlap: 0
        },
        {
            id: "2",
            score: 0.7,
            itemType: "storegeObject",
            recordId: "record2",
            parentRecordId: "parent2",
            fileFormat: "PDF",
            subObjectId: "sub2",
            subObjectType: "graph",
            text: "test text 2",
            only_one_index_text_chunk: false,
            index_text_chunk_length: 100,
            index_text_chunk_position: 0,
            index_text_chunk_overlap: 0
        },
        {
            id: "3",
            score: 0.5,
            itemType: "storegeObject",
            recordId: "record3",
            parentRecordId: "parent3",
            fileFormat: "CSV",
            subObjectId: "sub3",
            subObjectType: "graph",
            text: "test text 3",
            only_one_index_text_chunk: false,
            index_text_chunk_length: 100,
            index_text_chunk_position: 0,
            index_text_chunk_overlap: 0
        }
    ];

    describe("filterByMinScore", () => {
        it("should return all results when minScore is less than or equal to 0", () => {
            const result1 = filterByMinScore(mockSearchResults, 0);
            const result2 = filterByMinScore(mockSearchResults, -1);

            expect(result1).to.deep.equal(mockSearchResults);
            expect(result2).to.deep.equal(mockSearchResults);
        });

        it("should return all results when minScore is undefined", () => {
            const result = filterByMinScore(
                mockSearchResults,
                undefined as any
            );
            expect(result).to.deep.equal(mockSearchResults);
        });

        it("should filter out results with scores less than minScore", () => {
            const result = filterByMinScore(mockSearchResults, 0.6);

            expect(result).to.have.length(2);
            expect(result[0].id).to.equal("1");
            expect(result[1].id).to.equal("2");
        });

        it("should return empty array when all results have scores less than minScore", () => {
            const result = filterByMinScore(mockSearchResults, 1.0);
            expect(result).to.be.an("array").that.is.empty;
        });
    });

    describe("keepTopK", () => {
        it("should return the top k results with the highest scores", () => {
            const result = keepTopK(mockSearchResults, 2);

            expect(result).to.have.length(2);
            expect(result[0].id).to.equal("1");
            expect(result[1].id).to.equal("2");
        });

        it("should return all results when k is greater than the number of results", () => {
            const result = keepTopK(mockSearchResults, 5);
            expect(result).to.have.length(3);
        });

        it("should return empty array when k is 0", () => {
            const result = keepTopK(mockSearchResults, 0);
            expect(result).to.be.an("array").that.is.empty;
        });

        it("should return empty array when input is an empty array", () => {
            const result = keepTopK([], 3);
            expect(result).to.be.an("array").that.is.empty;
        });
    });
});

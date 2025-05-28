import { expect } from "chai";
import {
    Chunker,
    FixedLengthChunkStrategy
} from "../../vector-indexer/chunker.js";

describe("FixedLengthChunker", () => {
    it("should chunk the text into smaller chunks with proper overlapping", () => {
        const text = "ThisIsATextChunk";
        const chunkSize = 5;
        const overlap = 2;
        const chucker = new Chunker(
            new FixedLengthChunkStrategy(chunkSize, overlap)
        );
        const chunks = chucker.chunk(text);
        expect(chunks).to.deep.equal([
            "ThisI",
            "sIsAT",
            "AText",
            "xtChu",
            "hunk"
        ]);
    });

    it("should be able to handle empty text", () => {
        const text = "";
        const chunkSize = 5;
        const overlap = 2;
        const chunker = new Chunker(
            new FixedLengthChunkStrategy(chunkSize, overlap)
        );
        const chunks = chunker.chunk(text);
        expect(chunks).to.deep.equal([]);
    });

    it("should be able to handle text smaller than chunk size", () => {
        const text = "abc";
        const chunkSize = 5;
        const overlap = 2;
        const chunker = new Chunker(
            new FixedLengthChunkStrategy(chunkSize, overlap)
        );
        const chunks = chunker.chunk(text);
        expect(chunks).to.deep.equal(["abc"]);
    });

    it("should be able to handle text equal to chunk size", () => {
        const text = "12345";
        const chunkSize = 5;
        const overlap = 2;
        const chunker = new Chunker(
            new FixedLengthChunkStrategy(chunkSize, overlap)
        );
        const chunks = chunker.chunk(text);
        expect(chunks).to.deep.equal(["12345"]);
    });

    it("should throw error when overlap is greater than chunk size", () => {
        const text = "12345";
        const chunkSize = 5;
        const overlap = 6;
        const chunker = new Chunker(
            new FixedLengthChunkStrategy(chunkSize, overlap)
        );
        expect(() => chunker.chunk(text)).to.throw();
    });
});

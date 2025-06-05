import { expect } from "chai";
import {
    Chunker,
    FixedLengthChunkStrategy
} from "../../semantic-indexer/chunker.js";

describe("FixedLengthChunker", () => {
    it("should chunk the text into smaller chunks with proper overlapping", () => {
        const text = "TestText";
        const chunkSize = 4;
        const overlap = 1;
        const chucker = new Chunker(
            new FixedLengthChunkStrategy(chunkSize, overlap)
        );
        const chunks = chucker.chunk(text);
        expect(chunks).to.deep.equal([
            {
                text: "Test",
                length: 4,
                position: 0,
                overlap: 1
            },
            {
                text: "tTex",
                length: 4,
                position: 3,
                overlap: 1
            },
            {
                text: "xt",
                length: 2,
                position: 6,
                overlap: 1
            }
        ]);
    });

    it("should be able to handle empty text", () => {
        const text = "";
        const chunkSize = 4;
        const overlap = 1;
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
        expect(chunks).to.deep.equal([
            {
                text: "abc",
                length: 3,
                position: 0,
                overlap: 2
            }
        ]);
    });

    it("should be able to handle text equal to chunk size", () => {
        const text = "12345";
        const chunkSize = 5;
        const overlap = 2;
        const chunker = new Chunker(
            new FixedLengthChunkStrategy(chunkSize, overlap)
        );
        const chunks = chunker.chunk(text);
        expect(chunks).to.deep.equal([
            {
                text: "12345",
                length: 5,
                position: 0,
                overlap: 2
            }
        ]);
    });

    it("should throw error when overlap is greater than chunk size", () => {
        const text = "12345";
        const chunkSize = 5;
        const overlap = 6;
        expect(() => {
            const chunker = new Chunker(
                new FixedLengthChunkStrategy(chunkSize, overlap)
            );
            chunker.chunk(text);
        }).to.throw();
    });
});

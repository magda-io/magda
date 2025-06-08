import { expect } from "chai";
import {
    Chunker,
    FixedLengthChunkStrategy,
    RecursiveChunkStrategy
} from "../chunker.js";
import { expectThrowsAsync } from "./util.js";

describe("TokenBasedChunker", () => {
    it("should chunk the text into smaller chunks with proper overlapping", async () => {
        const text =
            "This is a test text, for testing the token-based chunker.";
        const chunkSize = 10;
        const overlap = 4;
        const chunker = new Chunker(
            new RecursiveChunkStrategy(chunkSize, overlap)
        );

        const chunks = await chunker.chunk(text);

        expect(chunks).to.be.not.null;
        expect(chunks.length).to.be.greaterThan(0);

        chunks.forEach((chunk) => {
            expect(chunk.length).to.be.equal(chunk.text.length);
        });

        chunks.forEach((chunk) => {
            // validate length property
            expect(chunk.length).to.be.equal(chunk.text.length);
            // validate position property
            expect(
                text.slice(chunk.position, chunk.position + chunk.length)
            ).to.be.equal(chunk.text);
        });

        // should be able to reconstruct
        let reconstructedText = "";
        chunks.forEach((chunk) => {
            reconstructedText += chunk.text.slice(chunk.overlap);
        });
        expect(reconstructedText).to.be.equal(text);
    });

    it("should be able to handle text smaller than chunk size", async () => {
        const text = "abc";
        const chunkSize = 5;
        const overlap = 2;
        const chunker = new Chunker(
            new RecursiveChunkStrategy(chunkSize, overlap)
        );
        const chunks = await chunker.chunk(text);
        expect(chunks).to.deep.equal([
            {
                text: "abc",
                length: 3,
                position: 0,
                overlap: 0
            }
        ]);
    });

    it("should throw error when overlap is greater than chunk size", async () => {
        const text = "abcde";
        const chunkSize = 5;
        const overlap = 6;

        expectThrowsAsync(async () => {
            const chunker = new Chunker(
                new RecursiveChunkStrategy(chunkSize, overlap)
            );
            await chunker.chunk(text);
        });
    });

    it("should be able to handle empty text", async () => {
        const text = "";
        const chunkSize = 10;
        const overlap = 4;
        const chunker = new Chunker(
            new RecursiveChunkStrategy(chunkSize, overlap)
        );
        const chunks = await chunker.chunk(text);
        expect(chunks).to.deep.equal([]);
    });
});

describe("FixedLengthChunker", () => {
    it("should chunk the text into smaller chunks with proper overlapping", async () => {
        const text = "TestText";
        const chunkSize = 4;
        const overlap = 1;
        const chucker = new Chunker(
            new FixedLengthChunkStrategy(chunkSize, overlap)
        );
        const chunks = await chucker.chunk(text);
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

    it("should be able to handle empty text", async () => {
        const text = "";
        const chunkSize = 4;
        const overlap = 1;
        const chunker = new Chunker(
            new FixedLengthChunkStrategy(chunkSize, overlap)
        );
        const chunks = await chunker.chunk(text);
        expect(chunks).to.deep.equal([]);
    });

    it("should be able to handle text smaller than chunk size", async () => {
        const text = "abc";
        const chunkSize = 5;
        const overlap = 2;
        const chunker = new Chunker(
            new FixedLengthChunkStrategy(chunkSize, overlap)
        );
        const chunks = await chunker.chunk(text);
        expect(chunks).to.deep.equal([
            {
                text: "abc",
                length: 3,
                position: 0,
                overlap: 2
            }
        ]);
    });

    it("should be able to handle text equal to chunk size", async () => {
        const text = "12345";
        const chunkSize = 5;
        const overlap = 2;
        const chunker = new Chunker(
            new FixedLengthChunkStrategy(chunkSize, overlap)
        );
        const chunks = await chunker.chunk(text);
        expect(chunks).to.deep.equal([
            {
                text: "12345",
                length: 5,
                position: 0,
                overlap: 2
            }
        ]);
    });

    it("should throw error when overlap is greater than chunk size", async () => {
        const text = "12345";
        const chunkSize = 5;
        const overlap = 6;
        expectThrowsAsync(async () => {
            const chunker = new Chunker(
                new FixedLengthChunkStrategy(chunkSize, overlap)
            );
            await chunker.chunk(text);
        });
    });
});

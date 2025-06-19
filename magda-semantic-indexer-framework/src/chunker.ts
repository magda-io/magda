import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

export interface ChunkResult {
    text: string;
    position: number;
    length: number;
    overlap: number;
}

export type ChunkStrategyType = (text: string) => Promise<ChunkResult[]>;

export interface ChunkStrategy {
    chunk: ChunkStrategyType;
}

export class Chunker {
    private strategy: ChunkStrategy;
    constructor(strategy: ChunkStrategy) {
        this.strategy = strategy;
    }

    async chunk(text: string): Promise<ChunkResult[]> {
        return this.strategy.chunk(text);
    }
}

export class UserDefinedChunkStrategy implements ChunkStrategy {
    private chunkFunction: ChunkStrategyType;

    constructor(chunkFunction: ChunkStrategyType) {
        this.chunkFunction = chunkFunction;
    }

    async chunk(text: string): Promise<ChunkResult[]> {
        return this.chunkFunction(text);
    }
}

export class RecursiveChunkStrategy {
    private chunkSize;
    private overlapTokens;

    constructor(chunkSize: number, overlapTokens: number) {
        this.chunkSize = chunkSize * 4;
        this.overlapTokens = overlapTokens * 4;
        if (overlapTokens >= chunkSize)
            throw new Error("overlapTokens must be < chunkSize");
    }

    async chunk(text: string): Promise<ChunkResult[]> {
        const splitter = new RecursiveCharacterTextSplitter({
            chunkSize: this.chunkSize,
            chunkOverlap: this.overlapTokens
        });
        const chunks = await splitter.splitText(text);

        const results: ChunkResult[] = [];
        let charPos = 0;
        let remainingText = text;

        for (let i = 0; i < chunks.length; i++) {
            let overlapChars = 0;
            if (i != 0) {
                for (let j = 0; j < chunks[i].length; j++) {
                    if (remainingText.startsWith(chunks[i].slice(j))) {
                        overlapChars = j;
                        break;
                    }
                }
            }
            remainingText = remainingText.slice(
                chunks[i].length - overlapChars
            );

            charPos -= overlapChars;
            results.push({
                text: chunks[i],
                position: charPos,
                length: chunks[i].length,
                overlap: overlapChars
            });
            charPos += chunks[i].length;
        }
        return results;
    }
}

export class FixedLengthChunkStrategy implements ChunkStrategy {
    private chunkSize: number;
    private overlap: number;

    constructor(chunkSize: number, overlap: number) {
        this.chunkSize = chunkSize;
        this.overlap = overlap;
        if (this.overlap >= this.chunkSize / 2) {
            throw new Error("overlap must be less than half of chunk size");
        }
    }

    async chunk(text: string): Promise<ChunkResult[]> {
        const chunks: ChunkResult[] = [];
        for (
            let i = 0;
            i < text.length - this.overlap;
            i += this.chunkSize - this.overlap
        ) {
            const chunkText = text.slice(i, i + this.chunkSize);
            chunks.push({
                text: chunkText,
                position: i,
                length: chunkText.length,
                overlap: this.overlap
            });
        }
        return chunks;
    }
}

import { RecursiveCharacterTextSplitter } from "./textSplitters.js";

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
    private overlap;

    constructor(chunkSize: number, overlap: number) {
        if (overlap >= chunkSize)
            throw new Error("overlap must be < chunkSize");
        this.chunkSize = chunkSize * 4;
        this.overlap = overlap * 4;
    }

    async chunk(text: string): Promise<ChunkResult[]> {
        if (!text) {
            return [];
        }

        if (text.length <= this.chunkSize) {
            return [
                {
                    text: text,
                    position: 0,
                    length: text.length,
                    overlap: 0
                }
            ];
        }

        const splitter = new RecursiveCharacterTextSplitter({
            chunkSize: this.chunkSize,
            chunkOverlap: this.overlap,
            keepSeparator: true,
            stripWhitespace: false
        });

        const chunks = await splitter.splitTextWithMetadata(text);

        for (let i = 1; i < chunks.length; i++) {
            if (chunks[i].overlap === 0 && chunks[i].text.trim() === "") {
                chunks[i - 1].text = chunks[i - 1].text + chunks[i].text;
                chunks[i - 1].length = chunks[i - 1].length + chunks[i].length;
                chunks.splice(i, 1);
                i--;
            }
        }

        return chunks;
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

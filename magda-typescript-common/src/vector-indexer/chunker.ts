// may add more chunking strategy in the future

export interface ChunkStrategy {
    chunk(text: string): string[];
}

export class Chunker {
    private strategy: ChunkStrategy;
    constructor(strategy: ChunkStrategy) {
        this.strategy = strategy;
    }

    chunk(text: string): string[] {
        return this.strategy.chunk(text);
    }
}

export class FixedLengthChunkStrategy {
    private chunkSize: number;
    private overlap: number;

    constructor(chunkSize: number, overlap: number) {
        this.chunkSize = chunkSize;
        this.overlap = overlap;
    }

    chunk(text: string): string[] {
        const chunks = [];
        if (this.overlap >= this.chunkSize) {
            throw new Error("Overlap must be less than chunk size");
        }
        for (
            let i = 0;
            i < text.length - this.overlap;
            i += this.chunkSize - this.overlap
        ) {
            chunks.push(text.slice(i, i + this.chunkSize));
        }
        return chunks;
    }
}

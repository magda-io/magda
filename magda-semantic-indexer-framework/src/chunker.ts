export interface ChunkResult {
    text: string;
    position: number;
    length: number;
    overlap: number;
}

export interface ChunkStrategy {
    chunk(text: string): ChunkResult[];
}

export class Chunker {
    private strategy: ChunkStrategy;
    constructor(strategy: ChunkStrategy) {
        this.strategy = strategy;
    }

    chunk(text: string): ChunkResult[] {
        return this.strategy.chunk(text);
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

    chunk(text: string): ChunkResult[] {
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

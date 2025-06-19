import EmbeddingApiClient from "magda-typescript-common/src/EmbeddingApiClient.js";
import OpensearchApiClient from "magda-typescript-common/src/OpensearchApiClient.js";
import { Chunker, ChunkResult } from "./chunker.js";
import { EmbeddingText } from "./createEmbeddingText.js";
import { SkipError } from "./SkipError.js";
import SemanticIndexerOptions from "./semanticIndexerOptions.js";
import { buildSemanticIndexDocument } from "./indexSchema.js";
import { v4 as uuidv4 } from "uuid";
import { Readable, Transform, Writable } from "stream";
import { pipeline } from "stream/promises";

interface Metadata {
    recordId: string;
    parentRecordId?: string;
    aspectId?: string;
    fileFormat?: string;
    subObjectId?: string;
    subObjectType?: string;
}

class BuildDocumentTransform extends Transform {
    private buffer: ChunkResult[] = [];

    constructor(
        private params: {
            options: SemanticIndexerOptions;
            embeddingApiClient: EmbeddingApiClient;
            bulkEmbeddingsSize: number;
            totalChunks: number;
            text: string;
            metadata: Metadata;
        }
    ) {
        super({ objectMode: true });
    }

    private async processBuffer(): Promise<void> {
        let embeddings: number[][];
        try {
            embeddings = await this.params.embeddingApiClient.get(
                this.buffer.map((c) => c.text)
            );
        } catch (error) {
            throw new SkipError(
                `Failed to get embeddings: ${(error as Error).message}`
            );
        }

        const documents = this.buffer.map((chunk: ChunkResult, i: number) =>
            buildSemanticIndexDocument({
                recordId: this.params.metadata.recordId,
                parentRecordId: this.params.metadata.parentRecordId,
                aspectId: this.params.metadata.aspectId,
                fileFormat: this.params.metadata.fileFormat,
                subObjectId: this.params.metadata.subObjectId,
                subObjectType: this.params.metadata.subObjectType,
                itemType: this.params.options.itemType,
                index_text_chunk: chunk.text,
                embedding: embeddings[i],
                only_one_index_text_chunk: this.params.totalChunks === 1,
                index_text_chunk_length: chunk.length,
                index_text_chunk_position: chunk.position,
                index_text_chunk_overlap: chunk.overlap
            })
        );

        for (let i = 0; i < documents.length; i++) {
            this.push(documents[i]);
        }

        this.buffer = [];
    }

    async _transform(chunk: ChunkResult, encoding: string, callback: Function) {
        this.buffer.push(chunk);

        if (this.buffer.length >= this.params.bulkEmbeddingsSize) {
            try {
                await this.processBuffer();
                callback();
            } catch (error) {
                callback(error);
            }
        } else {
            callback();
        }
    }

    async _flush(callback: Function) {
        if (this.buffer.length > 0) {
            try {
                await this.processBuffer();
                callback();
            } catch (error) {
                callback(error);
            }
        } else {
            callback();
        }
    }
}

class OpenSearchIndexStream extends Writable {
    private buffer: any[];

    constructor(
        private opensearchApiClient: OpensearchApiClient,
        private indexName: string,
        private bulkSize: number
    ) {
        super({ objectMode: true });
        this.buffer = [];
    }

    private async processBuffer(): Promise<void> {
        try {
            await this.opensearchApiClient.bulkIndexDocument(
                this.indexName,
                this.buffer
            );
            this.buffer = [];
        } catch (error) {
            throw new SkipError(
                `Failed to index documents: ${(error as Error).message}`
            );
        }
    }

    async _write(chunk: any, encoding: string, callback: Function) {
        this.buffer.push(chunk);

        if (this.buffer.length >= this.bulkSize) {
            try {
                await this.processBuffer();
                callback();
            } catch (error) {
                callback(error);
            }
        } else {
            callback();
        }
    }

    async _final(callback: Function) {
        if (this.buffer.length > 0) {
            try {
                await this.processBuffer();
                callback();
            } catch (error) {
                callback(error);
            }
        } else {
            callback();
        }
    }
}

export async function indexEmbeddingText({
    options,
    chunker,
    embeddingApiClient,
    opensearchApiClient,
    embeddingText,
    metadata
}: {
    options: SemanticIndexerOptions;
    chunker: Chunker;
    embeddingApiClient: EmbeddingApiClient;
    opensearchApiClient: OpensearchApiClient;
    embeddingText: EmbeddingText;
    metadata: Metadata;
}) {
    if (!embeddingText.text && !embeddingText.subObjects) {
        throw new SkipError("No text or subObjects found to index.");
    }

    const textsToProcess: Array<{ text: string; metadata: Metadata }> = [];

    if (embeddingText.text) {
        textsToProcess.push({
            text: embeddingText.text,
            metadata: { ...metadata }
        });
    }

    if (embeddingText.subObjects) {
        for (const sub of embeddingText.subObjects) {
            textsToProcess.push({
                text: sub.text,
                metadata: {
                    ...metadata,
                    subObjectId: sub.subObjectId || uuidv4(),
                    subObjectType: sub.subObjectType
                }
            });
        }
    }

    await Promise.all(
        textsToProcess.map((item) =>
            processSingleText({
                options,
                chunker,
                embeddingApiClient,
                opensearchApiClient,
                metadata: item.metadata,
                text: item.text
            })
        )
    );
}

async function processSingleText({
    options,
    chunker,
    embeddingApiClient,
    opensearchApiClient,
    metadata,
    text
}: {
    options: SemanticIndexerOptions;
    chunker: Chunker;
    embeddingApiClient: EmbeddingApiClient;
    opensearchApiClient: OpensearchApiClient;
    metadata: Metadata;
    text: string;
}) {
    const semanticIndexerConfig =
        options.argv.semanticIndexerConfig.semanticIndexer;
    const bulkEmbeddingsSize = semanticIndexerConfig.bulkEmbeddingsSize || 50;
    const bulkIndexSize = semanticIndexerConfig.bulkIndexSize || 1;
    const indexName =
        semanticIndexerConfig.opensearch.indices.semanticIndex.fullIndexName;

    const chunks = await chunker.chunk(text);
    if (!chunks || chunks.length === 0) {
        throw new SkipError("No chunks generated from text.");
    }

    const textChunkStream = Readable.from(chunks, { objectMode: true });
    const buildDocumentTransform = new BuildDocumentTransform({
        options,
        embeddingApiClient,
        bulkEmbeddingsSize,
        totalChunks: chunks.length,
        text,
        metadata
    });
    const openSearchStream = new OpenSearchIndexStream(
        opensearchApiClient,
        indexName,
        bulkIndexSize
    );

    try {
        await pipeline(
            textChunkStream,
            buildDocumentTransform,
            openSearchStream
        );
    } catch (error) {
        throw new SkipError(
            `Failed to index documents: ${(error as Error).message}`
        );
    }
}

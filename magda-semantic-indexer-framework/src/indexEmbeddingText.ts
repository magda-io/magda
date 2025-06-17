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

class BuildDocumentTransform extends Transform {
    private buffer: ChunkResult[];

    constructor(
        private options: SemanticIndexerOptions,
        private embeddingApiClient: EmbeddingApiClient,
        private bulkEmbeddingSize: number,
        private totalChunks: number,
        private recordId: string,
        private fileFormat?: string,
        private subObjectId?: string,
        private subObjectType?: string
    ) {
        super({ objectMode: true });
        this.buffer = [];
    }

    private async processBuffer(): Promise<void> {
        let embeddings: number[][];
        try {
            embeddings = await this.embeddingApiClient.get(
                this.buffer.map((c) => c.text)
            );
        } catch (error) {
            throw new SkipError(
                `Failed to get embeddings: ${(error as Error).message}`
            );
        }

        const documents = this.buffer.map((chunk: ChunkResult, i: number) =>
            buildSemanticIndexDocument({
                recordId: this.recordId,
                fileFormat: this.fileFormat,
                subObjectId: this.subObjectId,
                subObjectType: this.subObjectType,
                itemType: this.options.itemType,
                index_text_chunk: chunk.text,
                embedding: embeddings[i],
                only_one_index_text_chunk: this.totalChunks === 1,
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

        if (this.buffer.length >= this.bulkEmbeddingSize) {
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

type textToProcess = {
    text: string;
    recordId: string;
    fileFormat?: string;
    subObjectId?: string;
    subObjectType?: string;
};

export async function indexEmbeddingText(
    options: SemanticIndexerOptions,
    EmbeddingText: EmbeddingText,
    chunker: Chunker,
    embeddingApiClient: EmbeddingApiClient,
    opensearchApiClient: OpensearchApiClient,
    recordId: string,
    fileFormat?: string
) {
    if (!EmbeddingText.text && !EmbeddingText.subObjects) {
        throw new SkipError("No text or subObjects found to index.");
    }

    const textsToProcess: Array<textToProcess> = [];

    if (EmbeddingText.text) {
        textsToProcess.push({
            text: EmbeddingText.text,
            recordId,
            fileFormat
        });
    }

    if (EmbeddingText.subObjects) {
        for (const sub of EmbeddingText.subObjects) {
            textsToProcess.push({
                text: sub.text,
                recordId,
                fileFormat,
                subObjectId: sub.subObjectId || uuidv4(),
                subObjectType: sub.subObjectType
            });
        }
    }

    await Promise.all(
        textsToProcess.map((textToProcess) =>
            processSingleText(
                options,
                chunker,
                embeddingApiClient,
                opensearchApiClient,
                textToProcess
            )
        )
    );
}

async function processSingleText(
    options: SemanticIndexerOptions,
    chunker: Chunker,
    embeddingApiClient: EmbeddingApiClient,
    opensearchApiClient: OpensearchApiClient,
    textToProcess: textToProcess
) {
    const semanticIndexerConfig =
        options.argv.semanticIndexerConfig.semanticIndexer;
    const bulkEmbeddingsSize = semanticIndexerConfig.bulkEmbeddingsSize || 50;
    const bulkIndexSize = semanticIndexerConfig.bulkIndexSize || 1;
    const indexName =
        semanticIndexerConfig.opensearch.indices.semanticIndex.fullIndexName;

    const chunks = await chunker.chunk(textToProcess.text);
    if (!chunks || chunks.length === 0) {
        throw new SkipError("No chunks generated from text.");
    }

    const textChunkStream = Readable.from(chunks, { objectMode: true });
    const buildDocumentTransform = new BuildDocumentTransform(
        options,
        embeddingApiClient,
        bulkEmbeddingsSize,
        chunks.length,
        textToProcess.recordId,
        textToProcess.fileFormat,
        textToProcess.subObjectId,
        textToProcess.subObjectType
    );
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

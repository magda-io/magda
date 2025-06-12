import EmbeddingApiClient from "magda-typescript-common/src/EmbeddingApiClient.js";
import OpensearchApiClient from "magda-typescript-common/src/OpensearchApiClient.js";
import { Chunker } from "./chunker.js";
import { EmbeddingText } from "./createEmbeddingText.js";
import { SkipError } from "./SkipError.js";
import SemanticIndexerOptions from "./semanticIndexerOptions.js";
import { buildSemanticIndexDocument } from "./indexSchema.js";
import { v4 as uuidv4 } from "uuid";

export async function indexEmbeddingText(
    options: SemanticIndexerOptions,
    EmbeddingText: EmbeddingText,
    meta: { recordId: string; fileFormat?: string },
    chunker: Chunker,
    embeddingApiClient: EmbeddingApiClient,
    opensearchApiClient: OpensearchApiClient
) {
    if (!EmbeddingText.text && !EmbeddingText.subObjects) {
        throw new SkipError("No text or subObjects found to index.");
    }
    if (EmbeddingText.text) {
        await processSingleText(
            options,
            EmbeddingText.text,
            meta,
            chunker,
            embeddingApiClient,
            opensearchApiClient
        );
    }
    if (EmbeddingText.subObjects) {
        for (const sub of EmbeddingText.subObjects) {
            await processSingleText(
                options,
                sub.text,
                {
                    ...meta,
                    subObjectId: sub.subObjectId || uuidv4(),
                    subObjectType: sub.subObjectType
                },
                chunker,
                embeddingApiClient,
                opensearchApiClient
            );
        }
    }
}

async function processSingleText(
    options: SemanticIndexerOptions,
    text: string,
    meta: {
        recordId: string;
        fileFormat?: string;
        subObjectId?: string;
        subObjectType?: string;
    },
    chunker: Chunker,
    embeddingApiClient: EmbeddingApiClient,
    opensearchApiClient: OpensearchApiClient
) {
    const semanticIndexerConfig =
        options.argv.semanticIndexerConfig.semanticIndexer;
    const bulkIndexSize = semanticIndexerConfig.opensearch.bulkIndexSize || 1;
    const bulkEmbeddingsSize =
        semanticIndexerConfig.embeddingApi.bulkEmbeddingsSize || 1;

    const chunks = await chunker.chunk(text);
    if (!chunks || chunks.length === 0) {
        throw new SkipError("No chunks generated from text.");
    }

    const embeddings: number[][] = [];
    for (let i = 0; i < chunks.length; i += bulkEmbeddingsSize) {
        const batch = chunks.slice(i, i + bulkEmbeddingsSize);
        try {
            const batchEmbeddings = await embeddingApiClient.get(
                batch.map((c) => c.text)
            );
            embeddings.push(...batchEmbeddings);
        } catch (e) {
            throw new SkipError(
                `Failed to get embeddings: ${(e as Error).message}`
            );
        }
    }

    const documents = chunks.map((chunk, i) =>
        buildSemanticIndexDocument({
            ...meta,
            itemType: options.itemType,
            index_text_chunk: chunk.text,
            embedding: embeddings[i],
            only_one_index_text_chunk: chunks.length === 1,
            index_text_chunk_length: chunk.length,
            index_text_chunk_position: chunk.position,
            index_text_chunk_overlap: chunk.overlap
        })
    );

    const indexName =
        semanticIndexerConfig.opensearch.indices.semanticIndex.indexName;
    for (let i = 0; i < documents.length; i += bulkIndexSize) {
        const batch = documents.slice(i, i + bulkIndexSize);
        try {
            await opensearchApiClient.bulkIndexDocument(indexName, batch);
        } catch (e) {
            throw new SkipError(
                `Failed to index documents: ${(e as Error).message}`
            );
        }
    }
}

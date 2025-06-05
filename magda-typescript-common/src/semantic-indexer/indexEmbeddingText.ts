import EmbeddingApiClient from "../EmbeddingApiClient.js";
import OpensearchApiClient from "../OpensearchApiClient.js";
import { Chunker } from "./chunker.js";
import { EmbeddingText } from "./createEmbeddingText.js";
import { SkipError } from "./skipError.js";
import SemanticIndexerOptions from "./semanticIndexerOptions.js";
import {
    buildSemanticIndexDocument,
    SemanticIndexDocument
} from "./indexSchema.js";
import { v4 as uuidv4 } from "uuid";
import { config } from "./config.js";

export async function indexEmbeddingText(
    options: SemanticIndexerOptions,
    EmbeddingText: EmbeddingText,
    meta: { recordId: string; fileFormat?: string },
    chunker: Chunker,
    embeddingApiClient: EmbeddingApiClient,
    opensearchApiClient: OpensearchApiClient,
    bulkSize: number = 10
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
            opensearchApiClient,
            bulkSize
        );
    }
    if (EmbeddingText.subObjects) {
        for (const sub of EmbeddingText.subObjects) {
            await processSingleText(
                options,
                sub.text,
                {
                    ...meta,
                    subObjectId: sub.subObjectId || uuidv4().slice(0, 8),
                    subObjectType: sub.subObjectType
                },
                chunker,
                embeddingApiClient,
                opensearchApiClient,
                bulkSize
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
    opensearchApiClient: OpensearchApiClient,
    bulkSize: number
) {
    const chunks = chunker.chunk(text);
    if (!chunks || chunks.length === 0) {
        throw new SkipError("No chunks generated from text.");
    }
    let embeddings;
    try {
        embeddings = await embeddingApiClient.get(chunks.map((c) => c.text));
    } catch (e) {
        throw new SkipError(
            `Failed to get embeddings, error: ${(e as Error).message}`
        );
    }
    let documents: SemanticIndexDocument[] = [];
    for (let i = 0; i < chunks.length; i++) {
        const doc = buildSemanticIndexDocument({
            ...meta,
            itemType: options.itemType,
            index_text_chunk: chunks[i].text,
            embedding: embeddings[i],
            only_one_index_text_chunk: chunks.length === 1,
            index_text_chunk_length: chunks[i].length,
            index_text_chunk_position: chunks[i].position,
            index_text_chunk_overlap: chunks[i].overlap
        });
        documents.push(doc);
        if (documents.length >= bulkSize) {
            try {
                await opensearchApiClient.bulkIndexDocument(
                    config.elasticSearch.indices.semanticIndex.indexName,
                    documents
                );
            } catch (e) {
                throw new SkipError(
                    `Failed to bulk index documents, error: ${
                        (e as Error).message
                    }`
                );
            }
            documents = [];
        }
    }
    if (documents.length > 0) {
        try {
            await opensearchApiClient.bulkIndexDocument(
                config.elasticSearch.indices.semanticIndex.indexName,
                documents
            );
        } catch (e) {
            throw new SkipError(
                `Failed to bulk index documents (final batch), error: ${
                    (e as Error).message
                }`
            );
        }
    }
}

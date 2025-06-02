import VectorIndexerOptions from "./vectorIndexerOptions.js";
import MinionOptions, {
    onRecordFoundType
} from "@magda/minion-framework/dist/MinionOptions.js";
import { Chunker, FixedLengthChunkStrategy } from "./chunker.js";
import EmbeddingApiClient from "../EmbeddingApiClient.js";
import minion from "@magda/minion-framework";
import OpensearchApiClient from "../OpensearchApiClient.js";
import {
    buildVectorIndexDocument,
    VectorIndexDocument
} from "./vectorIndexDefinitions.js";
import { createVectorIndexMapping } from "./vectorIndexDefinitions.js";
import { EmbeddingText } from "./createEmbeddingText.js";
import { onRecordFoundRegistryRecord } from "./onRecordFoundRegistryRecord.js";
import { onRecordFoundStorageObject } from "./onRecordFoundStorageObject.js";

export async function vectorIndexer(userConfig: VectorIndexerOptions) {
    const opensearchApiClient = await OpensearchApiClient.getOpensearchApiClient(
        { url: userConfig.opensearchApiUrl }
    );
    const indexDefinition = createVectorIndexMapping(userConfig);
    if (!(await opensearchApiClient.indexExists(userConfig.indexName))) {
        await opensearchApiClient.createIndex(indexDefinition);
    }

    const embeddingApiClient = new EmbeddingApiClient({
        baseApiUrl: userConfig.embeddingApiUrl
    });
    const chunker = new Chunker(
        new FixedLengthChunkStrategy(userConfig.chunkSize, userConfig.overlap)
    );

    let onRecordFound: onRecordFoundType;
    let minionOptions: MinionOptions;

    if (userConfig.itemType === "registryRecord") {
        onRecordFound = onRecordFoundRegistryRecord(
            userConfig as any,
            chunker,
            embeddingApiClient,
            opensearchApiClient
        );
        minionOptions = {
            argv: userConfig.argv,
            id: userConfig.id,
            aspects: userConfig.aspects,
            optionalAspects: userConfig.optionalAspects,
            writeAspectDefs: [],
            async: true,
            dereference: true,
            includeEvents: false,
            includeRecords: true,
            onRecordFound: onRecordFound
        };
    } else if (userConfig.itemType === "storageObject") {
        onRecordFound = onRecordFoundStorageObject(
            userConfig as any,
            chunker,
            embeddingApiClient,
            opensearchApiClient
        );
        minionOptions = {
            argv: userConfig.argv,
            id: userConfig.id,
            aspects: ["dataset-distributions"],
            optionalAspects: [],
            writeAspectDefs: [],
            async: true,
            dereference: true,
            includeEvents: false,
            onRecordFound: onRecordFound
        };
    }

    minion(minionOptions).catch((e: Error) => {
        console.error("Error: " + e.message, e);
        process.exit(1);
    });
}

export async function chunkEmbedAndIndexEmbeddingText(
    config: VectorIndexerOptions,
    embeddingTextResult: EmbeddingText,
    meta: { recordId?: string; fileFormat?: string },
    chunker: Chunker,
    embeddingApiClient: EmbeddingApiClient,
    opensearchApiClient: OpensearchApiClient,
    bulkSize: number = 10
) {
    if (embeddingTextResult.text) {
        await processSingleChunk(
            config,
            embeddingTextResult.text,
            meta,
            chunker,
            embeddingApiClient,
            opensearchApiClient,
            bulkSize
        );
    }
    if (embeddingTextResult.subObjects) {
        for (const sub of embeddingTextResult.subObjects) {
            await processSingleChunk(
                config,
                sub.text,
                {
                    ...meta,
                    subObjectId: sub.subObjectId,
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

async function processSingleChunk(
    config: VectorIndexerOptions,
    text: string,
    meta: any,
    chunker: Chunker,
    embeddingApiClient: EmbeddingApiClient,
    opensearchApiClient: OpensearchApiClient,
    bulkSize: number
) {
    const chunks = chunker.chunk(text);
    const embeddings = await embeddingApiClient.get(chunks.map((c) => c.text));
    let documents: VectorIndexDocument[] = [];
    for (let i = 0; i < chunks.length; i++) {
        const doc = buildVectorIndexDocument({
            ...meta,
            itemType: config.itemType,
            index_text_chunk: chunks[i].text,
            embedding: embeddings[i],
            only_one_index_text_chunk: chunks.length === 1,
            index_text_chunk_length: chunks[i].length,
            index_text_chunk_position: chunks[i].position,
            index_text_chunk_overlap: chunks[i].overlap
        });
        documents.push(doc);
        if (documents.length >= bulkSize) {
            await opensearchApiClient.bulkIndexDocument(
                config.indexName,
                documents
            );
            documents = [];
        }
    }
    if (documents.length > 0) {
        await opensearchApiClient.bulkIndexDocument(
            config.indexName,
            documents
        );
    }
}

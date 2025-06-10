import { SemanticIndexerOptions } from "./index.js";

const SEMANTIC_INDEX_VERSION = 1;

export function createSemanticIndexerMapping(options: SemanticIndexerOptions) {
    const indexConfig =
        options.argv.semanticIndexerConfig.semanticIndexer.elasticSearch.indices
            .semanticIndex;
    const knnVectorFieldConfig = indexConfig.knnVectorFieldConfig;

    if (
        indexConfig.knnVectorFieldConfig.compressionLevel &&
        indexConfig.knnVectorFieldConfig.encoder
    ) {
        throw new Error("compressionLevel and encoder cannot be used together");
    }

    return {
        indexName: `${indexConfig.indexName}-${SEMANTIC_INDEX_VERSION}`,
        settings: {
            index: {
                number_of_shards: indexConfig.settings.number_of_shards,
                number_of_replicas: indexConfig.settings.number_of_replicas
            },
            "index.knn": true
        },
        mappings: {
            properties: {
                itemType: { type: "keyword" },
                recordId: { type: "keyword" },
                fileFormat: { type: "keyword" },
                subObjectId: { type: "keyword" },
                subObjectType: { type: "keyword" },
                index_text_chunk: { type: "keyword" },
                embedding: {
                    type: "knn_vector",
                    dimension: knnVectorFieldConfig.dimension,
                    space_type: knnVectorFieldConfig.spaceType,
                    mode: knnVectorFieldConfig.mode,
                    ...(knnVectorFieldConfig.compressionLevel
                        ? {
                              compression_level:
                                  knnVectorFieldConfig.compressionLevel
                          }
                        : {}),
                    method: {
                        name: "hnsw",
                        engine: "faiss",
                        parameters: {
                            m: knnVectorFieldConfig.m,
                            ef_construction:
                                knnVectorFieldConfig.efConstruction,
                            ef_search: knnVectorFieldConfig.efSearch,
                            ...(knnVectorFieldConfig.encoder
                                ? {
                                      encoder: {
                                          name:
                                              knnVectorFieldConfig.encoder.name,
                                          parameters: {
                                              type:
                                                  knnVectorFieldConfig.encoder
                                                      .type,
                                              clip:
                                                  knnVectorFieldConfig.encoder
                                                      .clip
                                          }
                                      }
                                  }
                                : {})
                        }
                    }
                },
                only_one_index_text_chunk: { type: "boolean" },
                index_text_chunk_length: { type: "integer" },
                index_text_chunk_position: { type: "integer" },
                index_text_chunk_overlap: { type: "integer" }
            }
        }
    };
}

export type ItemType = "registryRecord" | "storageObject";

export interface SemanticIndexDocument {
    itemType: ItemType;
    recordId: string;
    fileFormat?: string;
    subObjectId?: string;
    subObjectType?: string;
    index_text_chunk: string;
    embedding: number[];
    only_one_index_text_chunk: boolean;
    index_text_chunk_length: number;
    index_text_chunk_position: number;
    index_text_chunk_overlap: number;
}

export function buildSemanticIndexDocument(
    params: SemanticIndexDocument
): SemanticIndexDocument {
    return {
        itemType: params.itemType,
        recordId: params.recordId,
        ...(params.fileFormat !== undefined
            ? { fileFormat: params.fileFormat }
            : {}),
        ...(params.subObjectId !== undefined
            ? { subObjectId: params.subObjectId }
            : {}),
        ...(params.subObjectType !== undefined
            ? { subObjectType: params.subObjectType }
            : {}),
        index_text_chunk: params.index_text_chunk,
        embedding: params.embedding,
        only_one_index_text_chunk: params.only_one_index_text_chunk,
        index_text_chunk_length: params.index_text_chunk_length,
        index_text_chunk_position: params.index_text_chunk_position,
        index_text_chunk_overlap: params.index_text_chunk_overlap
    };
}

import { config } from "./config.js";

export type ItemType = "registryRecord" | "storageObject";

export function createSemanticIndexerMapping() {
    const knnVectorFieldConfig =
        config.elasticSearch.indices.semanticIndex.knnVectorFieldConfig;

    if (knnVectorFieldConfig.compressionLevel && knnVectorFieldConfig.encoder) {
        throw new Error("compressionLevel and encoder cannot be used together");
    }

    const mapping = {
        indexName: config.elasticSearch.indices.semanticIndex.indexName,
        settings: {
            index: {
                number_of_shards: 1,
                number_of_replicas: 1
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

    return mapping;
}

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

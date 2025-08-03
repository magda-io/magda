export interface SearchParams {
    query: string;
    max_num_results?: number;
    itemType?: string;
    fileFormat?: string;
    recordId?: string;
    subObjectId?: string;
    subObjectType?: string;
    minScore?: number;
}

export interface SearchResultItem {
    id: string;
    itemType: string;
    recordId: string;
    parentRecordId: string;
    fileFormat: string;
    subObjectId: string;
    subObjectType: string;
    text: string;
    only_one_index_text_chunk: boolean;
    index_text_chunk_length: number;
    index_text_chunk_position: number;
    index_text_chunk_overlap: number;
    score: number;
}

export interface SemanticSearchApiConfig {
    listenPort: number;
    opensearchApiURL: string;
    embeddingApiURL: string;
    registryReadonlyURL: string;
    jwtSecret: string;
    semanticIndexerConfig: SemanticIndexerConfig;
}

export interface SemanticIndexerConfig {
    indexName: string;
    indexVersion: number;
    mode: "on_disk" | "in_memory";
}

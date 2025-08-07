export interface IndexItem {
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
}

export interface SearchParams {
    query: string;
    max_num_results?: number;
    itemType?: "storageObject" | "registryRecord";
    fileFormat?: string;
    recordId?: string;
    subObjectId?: string;
    subObjectType?: string;
    minScore?: number;
}

export type SearchResultItem = { score: number } & Pick<
    IndexItem,
    | "id"
    | "itemType"
    | "recordId"
    | "parentRecordId"
    | "fileFormat"
    | "subObjectId"
    | "subObjectType"
    | "text"
    | "only_one_index_text_chunk"
    | "index_text_chunk_length"
    | "index_text_chunk_position"
    | "index_text_chunk_overlap"
>;

export interface RetrieveParams {
    ids: string[];
    mode?: "full" | "partial";
    precedingChunksNum?: number;
    subsequentChunksNum?: number;
}

export type RetrieveResultItem = Pick<
    IndexItem,
    | "id"
    | "itemType"
    | "recordId"
    | "parentRecordId"
    | "fileFormat"
    | "subObjectId"
    | "subObjectType"
    | "text"
>;

export interface SemanticIndexerConfig {
    indexName: string;
    indexVersion: number;
    mode: "on_disk" | "in_memory";
}

export interface SemanticSearchApiConfig {
    listenPort: number;
    opensearchApiURL: string;
    embeddingApiURL: string;
    registryReadonlyURL: string;
    jwtSecret: string;
    semanticIndexerConfig: SemanticIndexerConfig;
}

interface ElasticSearchConfig {
    serverUrl: string;
    indices: {
        semanticIndex: {
            indexName: string;
            settings: {
                number_of_shards: number;
                number_of_replicas: number;
            };
            knnVectorFieldConfig: {
                mode: string;
                dimension: number;
                spaceType: string;
                efConstruction: number;
                efSearch: number;
                m: number;
                encoder?: {
                    name: string;
                    type: string;
                    clip: boolean;
                };
                compressionLevel?: string;
            };
        };
    };
}

interface EmbeddingApiConfig {
    baseUrl: string;
}

export interface SemanticIndexerConfig {
    semanticIndexer: {
        chunkSizeLimit: number;
        overlap: number;
        elasticSearch: ElasticSearchConfig;
        embeddingApi: EmbeddingApiConfig;
    };
}

interface OpensearchConfig {
    serverUrl: string;
    indices: {
        semanticIndex: {
            indexName: string;
            indexVersion: number;
            numberOfShards: number;
            numberOfReplicas: number;
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

export interface MinioConfig {
    endPoint: string;
    port: number;
    useSSL: boolean;
    accessKey: string;
    secretKey: string;
    region: string;
    defaultDatasetBucket: string;
}

export interface SemanticIndexerConfig {
    semanticIndexer: {
        chunkSizeLimit: number;
        overlap: number;
        bulkEmbeddingsSize: number;
        bulkIndexSize: number;
        opensearch: OpensearchConfig;
        embeddingApi: EmbeddingApiConfig;
    };
}

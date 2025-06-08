import path from "path";
import { __dirname as getCurDirPath, require } from "@magda/esm-utils";

const configPath = path.resolve(getCurDirPath(), "./config.json");

export interface ElasticSearchConfig {
    serverUrl: string;
    indices: {
        semanticIndex: {
            indexName: string;
            knnVectorFieldConfig: {
                mode: string;
                dimension: number;
                spaceType: string;
                efConstruction: number;
                efSearch: number;
                m: number;
                encoder: {
                    name: string;
                    type: string;
                    clip: boolean;
                };
                compressionLevel: string;
            };
        };
    };
}

export interface EmbeddingApiConfig {
    baseUrl: string;
}

export interface DefaultConfig {
    chunkSizeLimit: number;
    overlap: number;
}

export interface SemanticIndexerConfig {
    elasticSearch: ElasticSearchConfig;
    embeddingApi: EmbeddingApiConfig;
    default: DefaultConfig;
}

export const config: SemanticIndexerConfig = require(configPath);

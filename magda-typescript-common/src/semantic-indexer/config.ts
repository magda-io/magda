import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
    chunkSize: number;
    overlap: number;
}

export interface Config {
    elasticSearch: ElasticSearchConfig;
    embeddingApi: EmbeddingApiConfig;
    default: DefaultConfig;
}

const configPath = path.resolve(__dirname, "./config.json");
const configContent = fs.readFileSync(configPath, "utf8");
export const config: Config = JSON.parse(configContent);

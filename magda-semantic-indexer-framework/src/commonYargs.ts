import yargs from "yargs";
import commonMinionYargs, {
    MinionArguments
} from "magda-minion-framework/src/commonYargs.js";
import { require } from "@magda/esm-utils";

export interface SemanticIndexerConfig {
    numberOfShards: number;
    numberOfReplicas: number;
    indexName: string;
    indexVersion: number;
    chunkSizeLimit: number;
    overlap: number;
    bulkEmbeddingsSize: number;
    bulkIndexSize: number;
    fullIndexName?: string;
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
}

export interface MinioConfig {
    endPoint: string;
    port: number;
    useSSL: boolean;
    region: string;
    defaultDatasetBucket: string;
}

export interface SemanticIndexerArguments extends MinionArguments {
    opensearchApiURL: string;
    embeddingApiURL: string;
    semanticIndexerConfig: SemanticIndexerConfig;
    minioConfig: MinioConfig;
    minioAccessKey: string;
    minioSecretKey: string;
    registryReadonlyURL: string;
}

export function commonYargs(
    defaultPort: number,
    defaultInternalUrl: string
): SemanticIndexerArguments {
    let argv = commonMinionYargs<any>(
        defaultPort,
        defaultInternalUrl,
        (y: yargs.Argv<MinionArguments>) =>
            y
                .option("semanticIndexerConfig", {
                    describe: "Semantic indexer configuration json",
                    type: "string",
                    coerce: (path: string): SemanticIndexerConfig => {
                        if (!path) {
                            throw new Error(
                                "Semantic indexer configuration not found"
                            );
                        }
                        const config: SemanticIndexerConfig =
                            path && require(path);
                        return config;
                    },
                    default: process.env.SEMANTIC_INDEXER_CONFIG_PATH || null
                })
                .option("minioConfig", {
                    describe: "Minio configuration json",
                    type: "string",
                    coerce: (path: string): MinioConfig => {
                        if (!path) {
                            throw new Error("Minio configuration not found");
                        }
                        const config: MinioConfig = path && require(path);
                        return config;
                    },
                    default: process.env.MINIO_CONFIG_PATH || null
                })
                .option("minioAccessKey", {
                    describe: "The access key to your minio server.",
                    type: "string",
                    demand: true,
                    default: process.env.MINIO_ACCESS_KEY || ""
                })
                .option("minioSecretKey", {
                    describe: "The secret key to your minio server.",
                    type: "string",
                    demand: true,
                    default: process.env.MINIO_SECRET_KEY || ""
                })
                .option("opensearchApiURL", {
                    describe: "The URL of the OpenSearch API.",
                    type: "string",
                    default:
                        process.env.OPENSEARCH_API_URL ||
                        "http://localhost:9200"
                })
                .option("embeddingApiURL", {
                    describe: "The URL of the embedding API.",
                    type: "string",
                    default:
                        process.env.EMBEDDING_API_URL || "http://localhost:3000"
                })
                .option("registryReadonlyURL", {
                    describe: "The URL of the registry readonly API.",
                    type: "string",
                    default:
                        process.env.REGISTRY_READ_ONLY_URL ||
                        "http://localhost:6101/v0"
                })
    );

    const { indexName, indexVersion } = argv.semanticIndexerConfig;
    argv.semanticIndexerConfig.fullIndexName = `${indexName}-v${indexVersion}`;
    return argv;
}

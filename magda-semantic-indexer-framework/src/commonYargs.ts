import yargs from "yargs";
import commonMinionYargs, {
    MinionArguments
} from "magda-minion-framework/src/commonYargs.js";
import { require } from "@magda/esm-utils";
import { MinioConfig, SemanticIndexerConfig } from "./configType.js";

export const defaultConfig: SemanticIndexerConfig = {
    semanticIndexer: {
        chunkSizeLimit: 100,
        overlap: 10,
        bulkEmbeddingsSize: 1,
        bulkIndexSize: 50,
        opensearch: {
            serverUrl: "http://localhost:9200",
            indices: {
                semanticIndex: {
                    indexName: "semantic-index",
                    indexVersion: 1,
                    numberOfShards: 1,
                    numberOfReplicas: 0,
                    knnVectorFieldConfig: {
                        mode: "in_memory",
                        dimension: 768,
                        spaceType: "l2",
                        efConstruction: 100,
                        efSearch: 100,
                        m: 16,
                        encoder: {
                            name: "sq",
                            type: "fp16",
                            clip: false
                        }
                    }
                }
            }
        },
        embeddingApi: {
            baseUrl: "http://localhost:3000"
        }
    }
};

export interface SemanticIndexerArguments extends MinionArguments {
    semanticIndexerConfig: SemanticIndexerConfig;
    minioConfig: MinioConfig;
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
                    coerce: (path?: string): SemanticIndexerConfig => {
                        const config: SemanticIndexerConfig =
                            path && require(path);
                        return config || defaultConfig;
                    },
                    default:
                        process.env.SEMANTIC_INDEXER_CONFIG_PATH || undefined
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
                .option("minioEnableSSL", {
                    describe:
                        "Whether or not to use https over http. Defaults to true",
                    type: "boolean",
                    default: false
                })
                .option("minioHost", {
                    describe: "Host where MinIO server is running.",
                    type: "string",
                    default: process.env.MINIO_HOST || "localhost"
                })
                .option("minioPort", {
                    describe: "Port where MinIO server is running.",
                    type: "number",
                    default: process.env.MINIO_PORT
                        ? Number.parseInt(process.env.MINIO_PORT)
                        : 9000
                })
                .option("minioRegion", {
                    describe: "Region where the server is being created.",
                    type: "string",
                    default: "unspecified-region"
                })
                .option("defaultDatasetBucket", {
                    describe:
                        "The name of the bucket to store datasets in by default.",
                    type: "string",
                    default:
                        process.env.DEFAULT_DATASET_BUCKET || "magda-datasets"
                })
    );

    argv.minioConfig = {
        endPoint: argv.minioHost,
        port: argv.minioPort,
        useSSL: argv.minioEnableSSL,
        accessKey: argv.minioAccessKey,
        secretKey: argv.minioSecretKey,
        region: argv.minioRegion,
        defaultDatasetBucket: argv.defaultDatasetBucket
    };

    const {
        indexName,
        indexVersion
    } = argv.semanticIndexerConfig.semanticIndexer.opensearch.indices.semanticIndex;
    argv.semanticIndexerConfig.semanticIndexer.opensearch.indices.semanticIndex.fullIndexName = `${indexName}-v${indexVersion}`;
    return argv;
}

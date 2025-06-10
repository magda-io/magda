import yargs from "yargs";
import commonMinionYargs, {
    MinionArguments
} from "magda-minion-framework/src/commonYargs.js";
import { require } from "@magda/esm-utils";
import { SemanticIndexerConfig } from "./configType.js";

export const defaultConfig: SemanticIndexerConfig = {
    semanticIndexer: {
        chunkSizeLimit: 100,
        overlap: 10,
        elasticSearch: {
            serverUrl: "http://localhost:9200",
            indices: {
                semanticIndex: {
                    indexName: "semantic-index",
                    settings: {
                        number_of_shards: 1,
                        number_of_replicas: 0
                    },
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
}

export function commonYargs(
    defaultPort: number,
    defaultInternalUrl: string
): SemanticIndexerArguments {
    let argv = commonMinionYargs<any>(
        defaultPort,
        defaultInternalUrl,
        (y: yargs.Argv<MinionArguments>) =>
            y.option("semanticIndexerConfig", {
                describe: "Semantic indexer configuration json",
                type: "string",
                coerce: (path?: string): SemanticIndexerConfig => {
                    const config: SemanticIndexerConfig = path && require(path);
                    return config || defaultConfig;
                },
                default: process.env.SEMANTIC_INDEXER_CONFIG_PATH || undefined
            })
    );

    return argv;
}

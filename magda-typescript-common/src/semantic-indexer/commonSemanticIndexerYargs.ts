import yargs from "yargs";
import { MinionArguments } from "@magda/minion-framework/dist/commonYargs.js";
import commonYargs from "@magda/minion-framework/dist/commonYargs.js";
import { config } from "./config.js";

export interface SemanticIndexerArguments extends MinionArguments {
    elasticSearchUrl: string;
    embeddingApiUrl: string;
}

export function commonSemanticIndexerYargs(
    defaultPort: number,
    defaultInternalUrl: string,
    additions: (
        a: yargs.Argv<SemanticIndexerArguments>
    ) => yargs.Argv<SemanticIndexerArguments> = (x) => x
): SemanticIndexerArguments {
    return commonYargs<SemanticIndexerArguments>(
        defaultPort,
        defaultInternalUrl,
        (y) =>
            additions(
                y
                    .option("elasticSearchUrl", {
                        describe: "ElasticSearch server url",
                        type: "string",
                        default:
                            process.env.ELASTIC_SEARCH_URL ||
                            config.elasticSearch.serverUrl ||
                            "http://localhost:9200"
                    })
                    .option("embeddingApiUrl", {
                        describe: "Embedding API url",
                        type: "string",
                        default:
                            process.env.EMBEDDING_API_URL ||
                            config.embeddingApi.baseUrl ||
                            "http://localhost:3000"
                    })
            )
    );
}

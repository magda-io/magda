import yargs from "yargs";
import express from "express";
import addJwtSecretFromEnvVar from "@magda/typescript-common/dist/session/addJwtSecretFromEnvVar.js";
import { SemanticSearchService } from "./service/SemanticSearchService.js";
import EmbeddingApiClient from "@magda/typescript-common/dist/EmbeddingApiClient.js";
import OpensearchApiClient from "@magda/typescript-common/dist/OpensearchApiClient.js";
import { createRoutes } from "./api/createApiRouter.js";
import retry from "magda-typescript-common/src/retry.js";

const argv = addJwtSecretFromEnvVar(
    yargs(process.argv.slice(2))
        .help()
        .option("listenPort", {
            describe: "The TCP/IP port on which semantic-search-api listens.",
            type: "number",
            default: 6123
        })
        .option("opensearchApiURL", {
            describe: "The URL of the OpenSearch API.",
            type: "string",
            default: process.env.OPENSEARCH_API_URL || "http://localhost:9200"
        })
        .option("embeddingApiURL", {
            describe: "The URL of the embedding API.",
            type: "string",
            default: process.env.EMBEDDING_API_URL || "http://localhost:3000"
        })
        .option("registryReadonlyURL", {
            describe: "The URL of the registry readonly API.",
            type: "string",
            default:
                process.env.REGISTRY_READ_ONLY_URL || "http://localhost:6101/v0"
        })
        .option("jwtSecret", {
            describe: "Shared secret for intra-network JWT auth",
            type: "string"
        })
        .option("semanticIndexName", {
            describe: "The name of the semantic index.",
            type: "string",
            default: "semantic-index"
        })
        .option("semanticIndexVersion", {
            describe: "System wide agreed version of the semantic indexer.",
            type: "number",
            default: 1
        })
        .option("semanticIndexerMode", {
            describe: "The mode of the vector workload mode",
            type: "string",
            default: "in_memory"
        }).argv
);

const opensearchApiClient = await retry(
    () =>
        OpensearchApiClient.getOpensearchApiClient({
            url: argv.opensearchApiURL
        }),
    5,
    5,
    (e, left) =>
        console.error(
            `Opensearch connection failed, remaining retries: ${left}, error:`,
            e.message
        )
);

const embeddingApiClient = await retry(
    () =>
        Promise.resolve(
            new EmbeddingApiClient({
                baseApiUrl: argv.embeddingApiURL
            })
        ),
    5,
    5,
    (e, left) =>
        console.error(
            `Embedding API connection failed, remaining retries: ${left}, error:`,
            e.message
        )
);

const semanticSearchService = new SemanticSearchService(
    embeddingApiClient,
    opensearchApiClient,
    {
        indexName: argv.semanticIndexName as string,
        indexVersion: argv.semanticIndexVersion as number,
        mode: argv.semanticIndexerMode as "on_disk" | "in_memory"
    }
);

const app = express();

app.use(express.json());

app.get("/v0/status/live", (_req, res) => {
    res.status(200).send("ok");
});

app.get("/v0/status/ready", async (_req: any, res: any) => {
    try {
        await opensearchApiClient.ping();
        await embeddingApiClient.testConnection();
        res.status(200).send("ready");
    } catch (e) {
        res.status(503).send("not ready");
    }
});

app.use(
    "/v0",
    createRoutes(semanticSearchService, {
        jwtSecret: argv.jwtSecret
    })
);

app.listen(argv.listenPort, () =>
    console.log(
        `Semantic Search API started, listening on port ${argv.listenPort}`
    )
);

process.on("unhandledRejection", (reason) => {
    console.error("Unhandled Rejection:", reason);
});

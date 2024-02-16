import express from "express";
import * as yargs from "yargs";

import createApiRouter from "./createApiRouter.js";
import addJwtSecretFromEnvVar from "magda-typescript-common/src/session/addJwtSecretFromEnvVar.js";

const argv = addJwtSecretFromEnvVar(
    yargs
        .config()
        .help()
        .option("listenPort", {
            describe: "The TCP/IP port on which the search-api should listen.",
            type: "number",
            default: 6122
        })
        .option("elasticSearchUrl", {
            describe: "The url of the elasticsearch node to connect to",
            type: "string",
            default: "http://localhost:9200"
        })
        .option("jwtSecret", {
            describe: "The shared secret for intra-network communication",
            type: "string"
        })
        .option("datasetsIndexId", {
            describe: "The id of the datasets index in elasticsearch",
            type: "string",
            demand: true,
            default: "datasets45"
        })
        .option("regionsIndexId", {
            describe: "The id of the regions index id",
            type: "string",
            demand: true,
            default: "regions24"
        })
        .option("publishersIndexId", {
            describe: "The id of the publishers index id",
            type: "string",
            demand: true,
            default: "publishers4"
        }).argv
);

// Create a new Express application.
const app = express();

app.use(
    "/v0",
    createApiRouter({
        jwtSecret: argv.jwtSecret,
        elasticSearchUrl: argv.elasticSearchUrl,
        datasetsIndexId: argv.datasetsIndexId,
        regionsIndexId: argv.regionsIndexId,
        publishersIndexId: argv.publishersIndexId
    })
);

app.listen(argv.listenPort);
console.log("Search API started on port " + argv.listenPort);

process.on(
    "unhandledRejection",
    (reason: {} | null | undefined, promise: any) => {
        console.error("Unhandled rejection:");
        console.error(reason);
    }
);

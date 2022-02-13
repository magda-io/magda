import express from "express";
import yargs from "yargs";

import createApiRouter from "./createApiRouter";
import createOpaRouter from "./createOpaRouter";
import Database from "./Database";
import addJwtSecretFromEnvVar from "magda-typescript-common/src/session/addJwtSecretFromEnvVar";
import AuthDecisionQueryClient from "magda-typescript-common/src/opa/AuthDecisionQueryClient";

const argv = addJwtSecretFromEnvVar(
    yargs
        .config()
        .help()
        .option("listenPort", {
            describe:
                "The TCP/IP port on which the authorization-api should listen.",
            type: "number",
            default: 6104
        })
        .option("dbHost", {
            describe: "The host running the auth database.",
            type: "string",
            default: "localhost"
        })
        .option("dbPort", {
            describe: "The port running the auth database.",
            type: "number",
            default: 5432
        })
        .option("opaUrl", {
            describe: "The access endpoint URL of the Open Policy Agent",
            type: "string",
            default: "http://localhost:8181/"
        })
        .option("registryApiUrl", {
            describe: "The access endpoint URL of the Registry API",
            type: "string",
            default: "http://localhost:6101/v0"
        })
        .option("jwtSecret", {
            describe: "The shared secret for intra-network communication",
            type: "string"
        })
        .option("debug", {
            describe: "When set to true, print verbose auth debug info to log.",
            type: "boolean",
            default: process.env.DEBUG == "true" ? true : false
        })
        .option("tenantId", {
            describe: "The tenant id for intra-network communication",
            type: "number",
            default: 0
        }).argv
);

// Create a new Express application.
var app = express();
app.use(require("body-parser").json());

const database = new Database({
    dbHost: argv.dbHost,
    dbPort: argv.dbPort
});

const authDecisionClient = new AuthDecisionQueryClient(
    argv.listenPort == 80
        ? "http://localhost/"
        : `http://localhost:${argv.listenPort}/`
);

app.use(
    "/v0",
    createApiRouter({
        jwtSecret: argv.jwtSecret,
        registryApiUrl: argv.registryApiUrl,
        opaUrl: argv.opaUrl,
        database,
        tenantId: argv.tenantId,
        authDecisionClient: authDecisionClient
    })
);

app.use(
    "/v0/opa",
    createOpaRouter({
        opaUrl: argv.opaUrl,
        jwtSecret: argv.jwtSecret,
        database,
        debug: argv.debug
    })
);

app.listen(argv.listenPort);
console.log("Auth API started on port " + argv.listenPort);

process.on(
    "unhandledRejection",
    (reason: {} | null | undefined, promise: Promise<any>) => {
        console.error("Unhandled rejection:");
        console.error(reason);
    }
);

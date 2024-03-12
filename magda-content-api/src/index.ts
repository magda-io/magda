import express from "express";
import yargs from "yargs";
import { createHttpTerminator } from "http-terminator";
import createApiRouter from "./createApiRouter.js";
import Database from "./Database.js";
import addJwtSecretFromEnvVar from "magda-typescript-common/src/session/addJwtSecretFromEnvVar.js";
import AuthDecisionQueryClient from "magda-typescript-common/src/opa/AuthDecisionQueryClient.js";
import { SQLSyntax } from "sql-syntax";

const argv = addJwtSecretFromEnvVar(
    yargs
        .config()
        .help()
        .option("listenPort", {
            describe:
                "The TCP/IP port on which the authorization-api should listen.",
            type: "number",
            default: 6119
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
        .option("dbName", {
            describe: "The database name.",
            type: "string",
            default: "content"
        })
        .option("authApiUrl", {
            describe: "The base URL of the auth API",
            type: "string",
            default: "http://localhost:6104/v0"
        })
        .option("skipAuth", {
            describe:
                "When set to true, API will not query policy engine for auth decision but assume it's always permitted. It's for debugging only.",
            type: "boolean",
            default: process.env.SKIP_AUTH == "true" ? true : false
        })
        .option("debug", {
            describe:
                "When set to true, print verbose debug info (e.g. SQL statements) to log.",
            type: "boolean",
            default: process.env.DEBUG == "true" ? true : false
        })
        .option("jwtSecret", {
            describe: "The shared secret for intra-network communication",
            type: "string"
        }).argv
);

const skipAuth = argv.skipAuth === true ? true : false;
const authDecisionClient = new AuthDecisionQueryClient(
    argv.authApiUrl,
    skipAuth
);
console.log(`SkipAuth: ${skipAuth}`);

if (argv.debug === true) {
    console.log("DEBUG mode is ON!");
    SQLSyntax.isDebugMode = true;
}

// Create a new Express application.
var app = express();
// app.use(require("body-parser").json());

app.use(
    "/v0",
    createApiRouter({
        authApiUrl: argv.authApiUrl,
        authDecisionClient,
        jwtSecret: argv.jwtSecret,
        database: new Database({
            dbHost: argv.dbHost,
            dbPort: argv.dbPort,
            dbName: argv.dbName
        })
    })
);

const server = app.listen(argv.listenPort);
const httpTerminator = createHttpTerminator({
    server
});
console.log("Contents API started on port " + argv.listenPort);

process.on(
    "unhandledRejection",
    (reason: {} | null | undefined, promise: Promise<any>) => {
        console.error("Unhandled rejection:");
        console.error(reason);
    }
);

process.on("SIGTERM", () => {
    console.log("SIGTERM signal received: closing HTTP server");
    httpTerminator.terminate().then(() => {
        console.log("HTTP server closed");
        process.exit(0);
    });
});

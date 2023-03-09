import express from "express";
import yargs from "yargs";
import { createHttpTerminator } from "http-terminator";
import Database from "./Database";
import createTenantsRouter from "./createTenantsRouter";
import addJwtSecretFromEnvVar from "magda-typescript-common/src/session/addJwtSecretFromEnvVar";
import AuthDecisionQueryClient from "magda-typescript-common/src/opa/AuthDecisionQueryClient";
import SQLSyntax from "sql-syntax";

const argv = addJwtSecretFromEnvVar(
    yargs
        .config()
        .help()
        .option("listenPort", {
            describe: "The TCP/IP port on which the tenant api should listen.",
            type: "number",
            default: 6130
        })
        .option("dbHost", {
            describe: "The host running the tenant database.",
            type: "string",
            default: "localhost"
        })
        .option("dbPort", {
            describe: "The port running the auth database.",
            type: "number",
            default: 5432
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
        .option("skipAuth", {
            describe:
                "When set to true, API will not query policy engine for auth decision but assume it's always permitted. It's for debugging only.",
            type: "boolean",
            default: process.env.SKIP_AUTH == "true" ? true : false
        })
        .option("authApiUrl", {
            describe: "The authorization api URL",
            type: "string",
            default: "http://localhost:6104/v0"
        }).argv
);

const skipAuth = argv.skipAuth === true ? true : false;
const authDecisionClient = new AuthDecisionQueryClient(
    argv.authApiUrl,
    skipAuth
);
console.log(`SkipAuth: ${skipAuth}`);

if (argv.debug === true) {
    SQLSyntax.isDebugMode = true;
    console.log("Debug mode has been turned on.");
}

// Create a new Express application.
var app = express();
app.use(require("body-parser").json());

const database = new Database({
    dbHost: argv.dbHost,
    dbPort: argv.dbPort
});

app.use(
    "/v0",
    createTenantsRouter({
        jwtSecret: argv.jwtSecret,
        database,
        authApiUrl: argv.authApiUrl,
        authDecisionClient
    })
);

const server = app.listen(argv.listenPort);
const httpTerminator = createHttpTerminator({
    server
});
console.log("Tenant API started on port " + argv.listenPort);

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

import express from "express";
import yargs from "yargs";
import "@magda/typescript-common/dist/pgTypes";

import createApiRouter from "./createApiRouter";
import createOpaRouter from "./createOpaRouter";
import Database from "./Database";
import addJwtSecretFromEnvVar from "magda-typescript-common/src/session/addJwtSecretFromEnvVar";
import AuthDecisionQueryClient from "magda-typescript-common/src/opa/AuthDecisionQueryClient";
import SQLSyntax from "sql-syntax";

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
        .option("failedApiKeyAuthBackOffSeconds", {
            describe:
                "How long time in number of seconds should the auth API fail all API key verification requests immediately without verifying the hash since the last failed API key verification request.",
            type: "number",
            default: 5
        })
        .option("tenantId", {
            describe: "The tenant id for intra-network communication",
            type: "number",
            default: 0
        }).argv
);

// Create a new Express application.
var app = express();
app.use(require("body-parser").json({ limit: "100mb" }));

const database = new Database({
    dbHost: argv.dbHost,
    dbPort: argv.dbPort
});

const authDecisionQueryEndpoint =
    argv.listenPort == 80
        ? "http://localhost/v0"
        : `http://localhost:${argv.listenPort}/v0`;
const skipAuth = argv.skipAuth === true ? true : false;

const authDecisionClient = new AuthDecisionQueryClient(
    authDecisionQueryEndpoint,
    skipAuth
);

console.log("Created Auth Decision Query Client: ");
console.log(`Endpint: ${authDecisionQueryEndpoint}`);
console.log(`SkipAuth: ${skipAuth}`);

if (argv.debug === true) {
    SQLSyntax.isDebugMode = true;
    console.log("Debug mode has been turned on.");
}

app.use(
    "/v0",
    createApiRouter({
        jwtSecret: argv.jwtSecret,
        opaUrl: argv.opaUrl,
        database,
        tenantId: argv.tenantId,
        authDecisionClient: authDecisionClient,
        failedApiKeyAuthBackOffSeconds: argv.failedApiKeyAuthBackOffSeconds
    })
);

const opaRouter = createOpaRouter({
    opaUrl: argv.opaUrl,
    jwtSecret: argv.jwtSecret,
    database,
    debug: argv.debug
});

// make sure OPA is accessible in a consistent way within cluster or outside cluster.
// i.e. authApiBaseUrl/opa
// here `authApiBaseUrl` can be a within cluster access url: e.g. http://authorization-api/v0/
// or an outside cluster url:  e.g. https://my-magda-domain/api/v0/auth/
app.use("/v0/public/opa", opaRouter);
app.use("/v0/opa", opaRouter);

app.listen(argv.listenPort);
console.log("Auth API started on port " + argv.listenPort);

process.on(
    "unhandledRejection",
    (reason: {} | null | undefined, promise: Promise<any>) => {
        console.error("Unhandled rejection:");
        console.error(reason);
    }
);

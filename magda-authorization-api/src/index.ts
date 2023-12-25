import express from "express";
import yargs from "yargs";
import "magda-typescript-common/src/pgTypes.js";
import { createHttpTerminator } from "http-terminator";
import createApiRouter from "./createApiRouter.js";
import createOpaRouter from "./createOpaRouter.js";
import Database from "./Database.js";
import addJwtSecretFromEnvVar from "magda-typescript-common/src/session/addJwtSecretFromEnvVar.js";
import AuthDecisionQueryClient from "magda-typescript-common/src/opa/AuthDecisionQueryClient.js";
import AuthorizedRegistryClient, {
    AuthorizedRegistryOptions
} from "magda-typescript-common/src/registry/AuthorizedRegistryClient.js";
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
        .option("registryApiUrl", {
            describe: "The access endpoint URL of the Registry API",
            type: "string",
            default: "http://localhost:6101/v0"
        })
        .option("userId", {
            describe:
                "The user id to use when making authenticated requests to the registry",
            type: "string",
            demand: true,
            default:
                process.env.USER_ID || process.env.npm_package_config_userId
        })
        .option("tenantId", {
            describe: "The tenant id for intra-network communication",
            type: "number",
            default: 0
        }).argv
);

// Create a new Express application.
const app = express();
app.use(express.json({ limit: "100mb" }));

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

const registryOptions: AuthorizedRegistryOptions = {
    baseUrl: argv.registryApiUrl,
    jwtSecret: argv.jwtSecret as string,
    userId: argv.userId,
    tenantId: argv.tenantId,
    maxRetries: 0
};

const registryClient = new AuthorizedRegistryClient(registryOptions);

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
        failedApiKeyAuthBackOffSeconds: argv.failedApiKeyAuthBackOffSeconds,
        registryClient
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

const server = app.listen(argv.listenPort);
const httpTerminator = createHttpTerminator({
    server
});
console.log("Auth API started on port " + argv.listenPort);

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

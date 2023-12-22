import express from "express";
import yargs from "yargs";
import { createHttpTerminator } from "http-terminator";
import buildApiRouter from "./buildApiRouter";
import addJwtSecretFromEnvVar from "magda-typescript-common/src/session/addJwtSecretFromEnvVar";
import AuthDecisionQueryClient from "magda-typescript-common/src/opa/AuthDecisionQueryClient";

const argv = addJwtSecretFromEnvVar(
    yargs
        .config()
        .help()
        .option("listenPort", {
            describe: "The TCP/IP port on which the admin api should listen.",
            type: "number",
            default: 6112
        })
        .option("dockerRepo", {
            describe:
                "The docker repo to look for docker images for creating connectors etc.",
            type: "string",
            default: "localhost:5000/data61"
        })
        .option("authApiUrl", {
            describe: "The base URL of the auth API",
            type: "string",
            default: "http://localhost:6104/v0"
        })
        .option("registryApiUrl", {
            describe: "The base URL of the registry API",
            type: "string",
            default: "http://localhost:6101/v0"
        })
        .option("imageTag", {
            describe: "When creating new pods, what tag should be used?",
            type: "string",
            default: "latest"
        })
        .option("pullPolicy", {
            describe: "K8S pull policy for created jobs",
            type: "string",
            default: "Always"
        })
        .option("userId", {
            describe:
                "The user id to use when making authenticated requests to the registry",
            type: "string",
            demand: true,
            default:
                process.env.USER_ID || process.env.npm_package_config_userId
        })
        .option("namespace", {
            describe: "Namespace for resources",
            type: "string",
            default: "default"
        })
        .option("jwtSecret", {
            describe:
                "Secret for decoding JWTs to determine if the caller is an admin",
            type: "string"
        })
        .option("skipAuth", {
            describe:
                "When set to true, API will not query policy engine for auth decision but assume it's always permitted. It's for debugging only.",
            type: "boolean",
            default: process.env.SKIP_AUTH == "true" ? true : false
        })
        .option("tenantId", {
            describe: "Tenant ID used to create connectors",
            type: "number",
            default: 0
        }).argv
);

const skipAuth = argv.skipAuth === true ? true : false;
const authDecisionClient = new AuthDecisionQueryClient(
    argv.authApiUrl,
    skipAuth
);
console.log(`SkipAuth: ${skipAuth}`);

// Create a new Express application.
var app = express();
app.use(express.json());

app.use(
    "/v0",
    buildApiRouter({
        dockerRepo: argv.dockerRepo,
        authApiUrl: argv.authApiUrl,
        imageTag: argv.imageTag,
        registryApiUrl: argv.registryApiUrl,
        pullPolicy: argv.pullPolicy,
        jwtSecret: argv.jwtSecret,
        userId: argv.userId,
        tenantId: argv.tenantId,
        namespace: argv.namespace,
        authDecisionClient
    })
);

const server = app.listen(argv.listenPort);
const httpTerminator = createHttpTerminator({
    server
});
console.log("Admin API started on port " + argv.listenPort);

process.on(
    "unhandledRejection",
    (reason: {} | null | undefined, promise: Promise<any>) => {
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

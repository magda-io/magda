import addJwtSecretFromEnvVar from "magda-typescript-common/src/session/addJwtSecretFromEnvVar";
import express from "express";
import { createHttpTerminator } from "http-terminator";
import yargs from "yargs";
import createApiRouter from "./createApiRouter";
import MagdaMinioClient from "./MagdaMinioClient";
import AuthDecisionQueryClient from "magda-typescript-common/src/opa/AuthDecisionQueryClient";
import AuthorizedRegistryClient, {
    AuthorizedRegistryOptions
} from "magda-typescript-common/src/registry/AuthorizedRegistryClient";

const argv = addJwtSecretFromEnvVar(
    yargs
        .config()
        .help()
        .option("listenPort", {
            describe: "The TCP/IP port on which the storage-api should listen.",
            type: "number",
            default: 6121
        })
        .option("registryApiUrl", {
            describe: "The access endpoint URL of the Registry API",
            type: "string",
            default: "http://localhost:6101/v0"
        })
        .option("minioAccessKey", {
            describe: "The access key to your minio server.",
            type: "string",
            demand: true,
            default: process.env.MINIO_ACCESS_KEY
        })
        .option("minioSecretKey", {
            describe: "The secret key to your minio server.",
            type: "string",
            demand: true,
            default: process.env.MINIO_SECRET_KEY
        })
        .option("minioEnableSSL", {
            describe: "Whether or not to use https over http. Defaults to true",
            type: "boolean",
            default: false
        })
        .option("minioHost", {
            describe: "Host where MinIO server is running.",
            type: "string",
            default: process.env.MINIO_HOST || "localhost"
        })
        .option("minioPort", {
            describe: "Port where MinIO server is running.",
            type: "number",
            default: process.env.MINIO_PORT
                ? Number.parseInt(process.env.MINIO_PORT)
                : 9000
        })
        .option("minioRegion", {
            describe: "Region where the server is being created.",
            type: "string",
            default: "unspecified-region"
        })
        .option("authApiUrl", {
            describe: "Url of the authorization API.",
            type: "string",
            default: "http://localhost:6104/v0"
        })
        .option("tenantId", {
            describe: "The tenant id for intra-network communication",
            type: "number",
            default: 0
        })
        .option("userId", {
            describe:
                "The user id to use when making authenticated requests to the registry",
            type: "string",
            demand: true,
            default:
                process.env.USER_ID || process.env.npm_package_config_userId
        })
        .option("uploadLimit", {
            describe: "How large a file can be uploaded to be stored by Magda",
            type: "string",
            default: "100mb"
        })
        .option("defaultBuckets", {
            describe: "Buckets to create on startup.",
            type: "array",
            default: ["magda-datasets"]
        })
        .option("skipAuth", {
            describe:
                "When set to true, API will not query policy engine for auth decision but assume it's always permitted. It's for debugging only.",
            type: "boolean",
            default: process.env.SKIP_AUTH == "true" ? true : false
        })
        .option("autoCreateBuckets", {
            describe:
                "Whether or not to create the default buckets on startup.",
            type: "boolean",
            default: true
        }).argv
);

const skipAuth = argv.skipAuth === true ? true : false;
const authDecisionClient = new AuthDecisionQueryClient(
    argv.authApiUrl,
    skipAuth
);

console.log(`SkipAuth: ${skipAuth}`);

const app = express();

const minioClient = new MagdaMinioClient({
    endPoint: argv.minioHost,
    port: argv.minioPort,
    useSSL: argv.minioEnableSSL,
    accessKey: argv.minioAccessKey,
    secretKey: argv.minioSecretKey,
    region: argv.minioRegion
});

const registryOptions: AuthorizedRegistryOptions = {
    baseUrl: argv.registryApiUrl,
    jwtSecret: argv.jwtSecret as string,
    userId: argv.userId,
    tenantId: argv.tenantId,
    maxRetries: 0
};
const registryClient = new AuthorizedRegistryClient(registryOptions);

app.use(
    "/v0",
    createApiRouter({
        objectStoreClient: minioClient,
        registryClient,
        tenantId: argv.tenantId,
        uploadLimit: argv.uploadLimit,
        authDecisionClient,
        jwtSecret: argv.jwtSecret as string,
        autoCreateBuckets: argv.autoCreateBuckets,
        defaultBuckets: argv.defaultBuckets
    })
);

const server = app.listen(argv.listenPort);
const httpTerminator = createHttpTerminator({
    server
});
console.log("Storage API started on port " + argv.listenPort);

process.on(
    "unhandledRejection",
    (reason: {} | null | undefined, _promise: any) => {
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

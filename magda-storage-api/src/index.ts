import addJwtSecretFromEnvVar from "@magda/typescript-common/dist/session/addJwtSecretFromEnvVar";
import * as express from "express";
import * as yargs from "yargs";
import createApiRouter from "./createApiRouter";
import MagdaMinioClient from "./MagdaMinioClient";
// import GoogleCloudStorageClient from "./GoogleCloudStorageClient";

const argv = addJwtSecretFromEnvVar(
    yargs
        .config()
        .help()
        .option("listenPort", {
            describe:
                "The TCP/IP port on which the datastore-api should listen.",
            type: "number",
            default: 6120
        })
        .option("bucket", {
            describe:
                "The Google Cloud Storage bucket from which to serve data.",
            type: "string",
            demand: true
        })
        .option("gcsKeyFile", {
            describe:
                "The JSON key file to use to access the Google Cloud Storage bucket.",
            type: "string"
        })
        .option("jwtSecret", {
            describe: "The shared secret for intra-network communication",
            type: "string"
        })
        .option("accessCacheMaxItems", {
            describe:
                "The maximum number of Tenant ID / User ID / Record ID triplets for which to cache the result of the registry access check.",
            type: "number",
            default: 1000
        })
        .option("accessCacheMaxAgeMilliseconds", {
            describe:
                "The time, in milliseconds, for which to cache the result of a registry access check for a particular Tenant ID / User ID / Record ID triplet.",
            type: "number",
            default: 30000
        })
        .option("minioAccessKey", {
            describe: "The access key to your minio server.",
            type: "string",
            demand: true
        })
        .option("minioSecretKey", {
            describe: "The secret key to your minio server.",
            type: "string",
            demand: true
        })
        .option("minioEnableSSL", {
            describe: "Whether or not to use https over http. Defaults to true",
            type: "boolean",
            default: true
        })
        .option("minioServerHost", {
            describe: "Host where MinIO server is running.",
            type: "string",
            default: "localhost"
        })
        .option("minioServerPort", {
            describe: "Port where MinIO server is running.",
            type: "number",
            default: 9000
        }).argv
);

var app = express();

app.use(
    "/v0",
    createApiRouter({
        jwtSecret: argv.jwtSecret!,
        objectStoreClient: new MagdaMinioClient({
            endPoint: argv.minioServerHost,
            port: argv.minioServerPort,
            useSSL: argv.minioEnableSSL,
            accessKey: argv.minioAccessKey,
            secretKey: argv.minioSecretKey,
            bucket: argv.bucket
        }),
        accessCacheMaxItems: argv.accessCacheMaxItems,
        accessCacheMaxAgeMilliseconds: argv.accessCacheMaxAgeMilliseconds
    })
);

app.listen(argv.listenPort);

console.log("Datastore API started on port " + argv.listenPort);

process.on(
    "unhandledRejection",
    (reason: {} | null | undefined, _promise: any) => {
        console.error("Unhandled rejection:");
        console.error(reason);
    }
);

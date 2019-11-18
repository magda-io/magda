import addJwtSecretFromEnvVar from "@magda/typescript-common/dist/session/addJwtSecretFromEnvVar";
import * as express from "express";
import * as yargs from "yargs";
import createApiRouter from "./createApiRouter";
import GoogleCloudStorageClient from "./GoogleCloudStorageClient";

const argv = addJwtSecretFromEnvVar(
    yargs
        .config()
        .help()
        .option("listenPort", {
            describe:
                "The TCP/IP port on which the datastore-api should listen.",
            type: "number",
            default: 6121
        })
        .option("registryApiUrl", {
            describe: "The access endpoint URL of the Registry API",
            type: "string",
            default: "http://localhost:6101/v0"
        })
        .option("gcsBucket", {
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
        }).argv
);

var app = express();

app.use(
    "/v0",
    createApiRouter({
        registryApiUrl: argv.registryApiUrl,
        jwtSecret: argv.jwtSecret,
        objectStoreClient: new GoogleCloudStorageClient(
            argv.gcsBucket,
            argv.gcsKeyFile
        ),
        accessCacheMaxItems: argv.accessCacheMaxItems,
        accessCacheMaxAgeMilliseconds: argv.accessCacheMaxAgeMilliseconds
    })
);

app.listen(argv.listenPort);

console.log("Datastore API started on port " + argv.listenPort);

process.on("unhandledRejection", (reason: string, promise: any) => {
    console.error("Unhandled rejection:");
    console.error(reason);
});

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
        .option("authApiUrl", {
            describe: "The base URL of the auth API",
            type: "string",
            default: "http://localhost:6104/v0"
        })
        .option("opaUrl", {
            describe: "The base URL of the opa API",
            type: "string",
            default: "http://localhost:6104/v0/opa/"
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
        }).argv
);

var app = express();

app.use(
    "/v0",
    createApiRouter({
        authApiUrl: argv.authApiUrl,
        opaUrl: argv.opaUrl,
        registryApiUrl: argv.registryApiUrl,
        jwtSecret: argv.jwtSecret,
        objectStoreClient: new GoogleCloudStorageClient(
            argv.gcsBucket,
            argv.gcsKeyFile
        )
    })
);

app.listen(argv.listenPort);

console.log("Datastore API started on port " + argv.listenPort);

process.on("unhandledRejection", (reason: string, promise: any) => {
    console.error("Unhandled rejection:");
    console.error(reason);
});

import * as express from "express";
import * as yargs from "yargs";
import createApiRouter from "./createApiRouter";
import MagdaMinioClient from "./MagdaMinioClient";

const argv = yargs
    .config()
    .help()
    .option("listenPort", {
        describe: "The TCP/IP port on which the datastore-api should listen.",
        type: "number",
        default: 6120
    })
    .option("bucket", {
        describe: "The Google Cloud Storage bucket from which to serve data.",
        type: "string",
        demand: true
    })
    .option("gcsKeyFile", {
        describe:
            "The JSON key file to use to access the Google Cloud Storage bucket.",
        type: "string"
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
    }).argv;

var app = express();

app.use(
    "/v0",
    createApiRouter({
        objectStoreClient: new MagdaMinioClient({
            endPoint: argv.minioServerHost,
            port: argv.minioServerPort,
            useSSL: argv.minioEnableSSL,
            accessKey: argv.minioAccessKey,
            secretKey: argv.minioSecretKey,
            bucket: argv.bucket
        })
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

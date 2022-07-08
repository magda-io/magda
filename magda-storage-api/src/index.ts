import addJwtSecretFromEnvVar from "@magda/typescript-common/dist/session/addJwtSecretFromEnvVar";
import express from "express";
import yargs from "yargs";
import createApiRouter from "./createApiRouter";
import MagdaMinioClient from "./MagdaMinioClient";

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
        .option("autoCreateBuckets", {
            describe:
                "Whether or not to create the default buckets on startup.",
            type: "boolean",
            default: true
        }).argv
);

(async () => {
    try {
        const app = express();

        const minioClient = new MagdaMinioClient({
            endPoint: argv.minioHost,
            port: argv.minioPort,
            useSSL: argv.minioEnableSSL,
            accessKey: argv.minioAccessKey,
            secretKey: argv.minioSecretKey,
            region: argv.minioRegion
        });

        if (argv.autoCreateBuckets) {
            console.info("Ensuring that default buckets exist...");

            for (let bucket of argv.defaultBuckets) {
                console.info(`Creating default bucket ${bucket}`);
                await minioClient.createBucket(bucket);
            }

            console.info("Finished creating default buckets");
        } else {
            console.info(
                "Skipping creation of default buckets. (autoCreateBuckets: false)"
            );
        }

        app.use(
            "/v0",
            createApiRouter({
                objectStoreClient: minioClient,
                registryApiUrl: argv.registryApiUrl,
                authApiUrl: argv.authApiUrl,
                jwtSecret: argv.jwtSecret as string,
                tenantId: argv.tenantId,
                uploadLimit: argv.uploadLimit
            })
        );

        app.listen(argv.listenPort);

        console.log("Storage API started on port " + argv.listenPort);
    } catch (e) {
        console.error(e);
    }
})();

process.on(
    "unhandledRejection",
    (reason: {} | null | undefined, _promise: any) => {
        console.error("Unhandled rejection:");
        console.error(reason);
    }
);

import ServiceRunner from "./ServiceRunner.js";
import { program } from "commander";
import delay from "magda-typescript-common/src/delay.js";
import pkg from "../package.json";

program
    .name("Magda Service Runner")
    .version(pkg.version)
    .description(
        "A CLI tool run key Magda services (e.g. auth) in Docker containers without k8s cluster. It's for local dev or running test cases only."
    )
    .option(
        "--auth",
        "Start auth related services. Including postgres DB with latest schema, OPA and Auth API. "
    )
    .option("--registryApi", "Start registry API. ")
    .option(
        "--storageApi",
        "Start registry API. This option includes minio service as well."
    )
    .option("--es", "Start Magda's elasticsearch service.")
    .option(
        "--searchApi",
        "Start Magda's search API service. When this option is set, elasticsearch & embedding api service will be started as well."
    )
    .option("--embeddingApi", "Start Magda's Embedding API service.")
    .option(
        "--indexer",
        "Start Magda's indexer and keep it running. When this option is set, elasticsearch & embedding api service will be started as well." +
            "Please note: this service will still be run during elasticsearch's starting up in order to setup indices. " +
            "However, when this switch is off, the indexer will auto-exit after the setup job is done."
    )
    .option(
        "--jwtSecret, -s <JWT Secret>",
        "Specify JWT secret all service used. If not specified, a random generate secret will be used."
    )
    .option(
        "--debug",
        "Turn on debug mode of Auth Service. Auth API will output all auth decision details."
    )
    .option(
        "--skipAuth",
        "When specify, Auth API will skip query OPA but always assume an `unconditionalTrue` decision. For debug purpose only."
    );

program.parse();

const options = program.opts();

if (!Object.keys(options).length) {
    program.help();
}

const serviceRunner = new ServiceRunner();

if (options?.auth) {
    serviceRunner.enableAuthService = true;
}

if (options?.registryApi) {
    serviceRunner.enableRegistryApi = true;
}

if (options?.storageApi) {
    serviceRunner.enableStorageApi = true;
}

if (options?.es) {
    serviceRunner.enableElasticSearch = true;
}

if (options?.searchApi) {
    serviceRunner.enableSearchApi = true;
}

if (options?.indexer) {
    serviceRunner.enableIndexer = true;
}

if (options?.embeddingApi) {
    serviceRunner.enableEmbeddingApi = true;
}

if (options?.jwtSecret) {
    serviceRunner.jwtSecret = options.jwtSecret;
}

if (options?.debug) {
    serviceRunner.authApiDebugMode = true;
}

if (options?.skipAuth) {
    serviceRunner.authApiSkipAuth = true;
}

let shouldExit = false;

process.on(
    "unhandledRejection",
    (reason: {} | null | undefined, promise: Promise<any>) => {
        console.error("Unhandled rejection:");
        console.error(reason);
    }
);

process.on("SIGINT", async () => {
    shouldExit = true;
    serviceRunner.shouldExit = true;
    await serviceRunner.destroy();
});

process.on("SIGTERM", async () => {
    shouldExit = true;
    serviceRunner.shouldExit = true;
    await serviceRunner.destroy();
});

process.on("beforeExit", async () => {
    if (shouldExit) {
        return;
    }
    await delay(1000);
});

async () => {
    try {
        await serviceRunner.create();
    } catch (e) {
        console.error(e);
    }
};

serviceRunner.create().catch((e) => {
    console.error("Error when create services: " + e);
});

import ServiceRunner from "./ServiceRunner";
import { program } from "commander";
import delay from "magda-typescript-common/src/delay";
import pkg from "../package.json";

program
    .name("Magda Service Runner")
    .version(pkg.version)
    .description(
        "A CLI tool run key Magda services (e.g. auth) in Docker containers without k8s cluster. It's for local dev or running test cases only."
    )
    .option(
        "--auth",
        "Start auth related services. Including postgres DB with latest schema, OPA and Auth API. This option doesn't require a local docker registry."
    )
    .option(
        "--registryApi",
        "Start registry API. This option doesn't require a local docker registry."
    )
    .option(
        "--storageApi",
        "Start registry API. This option doesn't require a local docker registry."
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
    )
    .option(
        "--es",
        "Start Magda's elasticsearch service. Requires built Magda elasticsearch docker image available in local registry localhost:5000 (or use --registry, -r to specify a different registry)."
    )
    .option(
        "--registry, -r <docker registry>",
        "Specify alternative docker registry. Default: localhost:5000"
    )
    .option(
        "--tag, -r <docker registry>",
        "Specify alternative default image tag. Default: latest"
    );

program.parse();

const options = program.opts();

if (!Object.keys(options).length) {
    program.help();
}

const serviceRunner = new ServiceRunner();

if (options?.registry) {
    serviceRunner.appImgRegistry = `${options.registry}/data61`;
}

if (options?.tag) {
    serviceRunner.appImgTag = options.tag;
}

if (!options?.auth) {
    serviceRunner.enableAuthService = false;
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

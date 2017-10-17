import * as express from "express";
import buildApiRouter from "./buildApiRouter";
import * as yargs from "yargs";

const argv = yargs
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
    .option("kubernetesApiType", {
        describe: "What kubernetes API to connect to",
        type: "string",
        choices: ["minikube", "cluster"],
        default: "minikube"
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
        default: process.env.USER_ID || process.env.npm_package_config_userId
    })
    .option("jwtSecret", {
        // describe:
        //     "Secret for decoding JWTs to determine if the caller is an admin",
        type: "string",
        demand: true,
        default:
            process.env.JWT_SECRET || process.env.npm_package_config_jwtSecret
    })
    .showHelpOnFail(false).argv;

// Create a new Express application.
var app = express();
app.use(require("body-parser").json());

app.use(
    "/v0",
    buildApiRouter({
        dockerRepo: argv.dockerRepo,
        authApiUrl: argv.authApiUrl,
        imageTag: argv.imageTag,
        kubernetesApiType: argv.kubernetesApiType,
        registryApiUrl: argv.registryApiUrl,
        pullPolicy: argv.pullPolicy,
        jwtSecret: argv.jwtSecret,
        userId: argv.userId
    })
);

app.listen(argv.listenPort);
console.log("Admin API started on port " + argv.listenPort);

process.on("unhandledRejection", (reason: string, promise: any) => {
    console.error(reason);
});

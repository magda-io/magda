import * as express from "express";
import * as yargs from "yargs";

import createApiRouter from "./createApiRouter";
import createOpaRouter from "./createOpaRouter";
import Database from "./Database";
import addJwtSecretFromEnvVar from "@magda/typescript-common/dist/session/addJwtSecretFromEnvVar";

const argv = addJwtSecretFromEnvVar(
    yargs
        .config()
        .help()
        .option("listenPort", {
            describe:
                "The TCP/IP port on which the authorization-api should listen.",
            type: "number",
            default: 6104
        })
        .option("dbHost", {
            describe: "The host running the auth database.",
            type: "string",
            default: "localhost"
        })
        .option("dbPort", {
            describe: "The port running the auth database.",
            type: "number",
            default: 5432
        })
        .option("opaUrl", {
            describe: "The access endpoint URL of the Open Policy Agent",
            type: "string",
            default: "http://localhost:8181/"
        })
        .option("registryApiUrl", {
            describe: "The access endpoint URL of the Registry API",
            type: "string",
            default: "http://localhost:6101/v0"
        })
        .option("jwtSecret", {
            describe: "The shared secret for intra-network communication",
            type: "string"
        }).argv
);

// Create a new Express application.
var app = express();
app.use(require("body-parser").json());

const database = new Database({
    dbHost: argv.dbHost,
    dbPort: argv.dbPort
});

app.use(
    "/v0",
    createApiRouter({
        jwtSecret: argv.jwtSecret,
        registryApiUrl: argv.registryApiUrl,
        opaUrl: argv.opaUrl,
        database
    })
);

app.use(
    "/v0/opa",
    createOpaRouter({
        opaUrl: argv.opaUrl,
        jwtSecret: argv.jwtSecret,
        database
    })
);

app.listen(argv.listenPort);
console.log("Auth API started on port " + argv.listenPort);

process.on("unhandledRejection", (reason: string, promise: any) => {
    console.error("Unhandled rejection:");
    console.error(reason);
});

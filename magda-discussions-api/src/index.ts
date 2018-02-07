import * as express from "express";
import * as yargs from "yargs";

import ApiClient from "@magda/typescript-common/dist/authorization-api/ApiClient";
import addJwtSecretFromEnvVar from "@magda/typescript-common/dist/session/addJwtSecretFromEnvVar";

import createApiRouter from "./createApiRouter";
import Database from "./Database";

const argv = addJwtSecretFromEnvVar(
    yargs
        .config()
        .help()
        .option("listenPort", {
            describe:
                "The TCP/IP port on which the authorization-api should listen.",
            type: "number",
            default: 6105
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
        .option("authorizationApi", {
            describe: "The base URL of the authorization API.",
            type: "string",
            default: "http://localhost:6104/v0"
        })
        .option("jwtSecret", {
            describe: "The shared secret for intra-network communication",
            type: "string"
        }).argv
);

const app = express();
app.use(require("body-parser").json());

app.use(
    "/v0",
    createApiRouter({
        database: new Database({
            dbHost: argv.dbHost,
            dbPort: argv.dbPort
        }),
        authorizationApi: new ApiClient(argv.authorizationApi),
        jwtSecret: argv.jwtSecret
    })
);

const listenPort = argv.listenPort;
app.listen(listenPort);
console.log("Listening on " + listenPort);

process.on("unhandledRejection", (reason: string, promise: any) => {
    console.error(reason);
});

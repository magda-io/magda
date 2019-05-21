import * as express from "express";
import * as yargs from "yargs";

import createApiRouter from "./createApiRouter";
import createOpaRouter from "./createOpaRouter";
import Database from "./Database";
import addJwtSecretFromEnvVar from "@magda/typescript-common/dist/session/addJwtSecretFromEnvVar";
import NestedSetModelQueryer from "./NestedSetModelQueryer";

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

const orgQueryer = new NestedSetModelQueryer(database.getPool(), "auth");
orgQueryer.defaultSelectFieldList = [
    "id",
    "name",
    "description",
    "create_by",
    "create_time",
    "edit_by",
    "edit_time"
];

app.use(
    "/v0",
    createApiRouter({
        jwtSecret: argv.jwtSecret,
        database,
        orgQueryer
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

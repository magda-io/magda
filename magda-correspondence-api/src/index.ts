import * as express from "express";
import * as yargs from "yargs";

import addJwtSecretFromEnvVar from "@magda/typescript-common/dist/session/addJwtSecretFromEnvVar";

import createApiRouter from "./createApiRouter";

const argv = addJwtSecretFromEnvVar(
    yargs
        .config()
        .help()
        .option("listenPort", {
            describe:
                "The TCP/IP port on which the authorization-api should listen.",
            type: "number",
            default: 6117
        })
        .option("jwtSecret", {
            describe: "The shared secret for intra-network communication",
            type: "string"
        })
        .option("smtpHostname", {
            describe: "The SMTP server hostname",
            type: "string"
        })
        .option("smtpPort", {
            describe: "The SMTP server port",
            type: "number",
            default: 587
        })
        .option("smtpSecure", {
            describe: "SMTP using TLS?",
            type: "boolean",
            default: false
        })
        .option("smtpUsername", {
            describe: "The username to authenticate with the SMTP server",
            type: "string"
        })
        .option("smtpPassword", {
            describe: "The password to authenticate with the SMTP server",
            type: "string"
        }).argv
);

const app = express();
app.use(require("body-parser").json());

app.use(
    "/v0",
    createApiRouter({
        jwtSecret: argv.jwtSecret,
        smtpHostname: argv.smtpHostname,
        smtpPort: argv.smtpPort,
        smtpSecure: argv.smtpSecure,
        smtpUsername: argv.smtpUsername,
        smtpPassword: argv.smtpPassword
    })
);

const listenPort = argv.listenPort;
app.listen(listenPort);
console.log("Listening on " + listenPort);

process.on("unhandledRejection", (reason: string, promise: any) => {
    console.error(reason);
});

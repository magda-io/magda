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
        .option("registryUrl", {
            describe: "The base url for the registry",
            type: "string",
            default:
                process.env.REGISTRY_URL ||
                process.env.npm_package_config_registryUrl ||
                "http://localhost:6101/v0"
        })
        .option("jwtSecret", {
            describe: "The shared secret for intra-network communication",
            type: "string"
        })
        .option("smtpHostname", {
            describe: "The SMTP server hostname",
            type: "string",
            default: ""
        })
        .option("smtpPort", {
            describe: "The SMTP server port",
            type: "number",
            default: 465
        })
        .option("smtpSecure", {
            describe: "If the SMTP server should use SSL/TLS",
            type: "boolean",
            default: true
        })
        .option("smtpUsername", {
            describe: "The username to authenticate with the SMTP server",
            type: "string",
            default: ""
        })
        .option("smtpPassword", {
            describe: "The password to authenticate with the SMTP server",
            type: "string",
            default: ""
        }).argv
);

const app = express();
app.use(require("body-parser").json());
app.use(
    "/v0",
    createApiRouter({
        jwtSecret: argv.jwtSecret,
        registryUrl: argv.registryUrl,
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

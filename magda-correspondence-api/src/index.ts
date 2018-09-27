import * as express from "express";
import * as yargs from "yargs";
import * as path from "path";

import RegistryClient from "@magda/typescript-common/dist/registry/RegistryClient";

import createApiRouter from "./createApiRouter";
import { NodeMailerSMTPMailer } from "./SMTPMailer";
import CContentApiDirMapper from "./CContentApiDirMapper";

const argv = yargs
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
            "http://localhost:6117/api/v0/registry"
    })
    .option("contentApiUrl", {
        describe: "The base URL of the content API.",
        type: "string",
        default:
            process.env.CONTENT_API_URL ||
            process.env.npm_package_config_contentApiUrl ||
            "http://localhost:6119/v0"
    })
    .option("externalUrl", {
        describe:
            "The base external URL for constructing hyperlinks back to the portal in emails - e.g. 'https://search.data.gov.au'. Don't leave a trailing /",
        type: "string",
        demandOption: true,
        default: process.env.npm_package_config_externalUrl
    })
    .option("smtpHostname", {
        describe: "The SMTP server hostname",
        type: "string",
        default: "localhost"
    })
    .option("smtpPort", {
        describe: "The SMTP server port",
        type: "number",
        default: 587
    })
    .option("smtpSecure", {
        describe: "If the SMTP server should use SSL/TLS",
        type: "boolean",
        default: true
    })
    .option("smtpUsername", {
        describe:
            "The username to authenticate with the SMTP server. Also passable as an env var via SMTP_USERNAME",
        type: "string"
    })
    .option("smtpPassword", {
        describe:
            "The password to authenticate with the SMTP server. Also passable as an env var via SMTP_PASSWORD",
        type: "string"
    })
    .option("defaultRecipient", {
        describe:
            "The email address to send data requests and questions/feedback on datasets where the email address couldn't be resolved",
        type: "string",
        demandOption: true
    })
    .option("alwaysSendToDefaultRecipient", {
        describe:
            "Whether to always send emails to the default recipient even if there's another recipient available - useful for test environments, or if you don't want users to be able to directly bother data custodians",
        type: "boolean",
        default: false
    })
    .option("jwtSecret", {
        describe: "The shared secret for intra-network communication",
        type: "string",
        default:
            process.env.JWT_SECRET || process.env.npm_package_config_jwtSecret
    })
    .option("userId", {
        describe:
            "The user id to use when making authenticated requests to the registry",
        type: "string",
        default: process.env.USER_ID || process.env.npm_package_config_userId
    }).argv;

const app = express();
app.use(require("body-parser").json());
app.use(
    "/v0",
    createApiRouter({
        registry: new RegistryClient({ baseUrl: argv.registryUrl }),
        contentApiUrl: argv.contentApiUrl,
        defaultRecipient: argv.defaultRecipient,
        externalUrl: argv.externalUrl,
        smtpMailer: new NodeMailerSMTPMailer({
            smtpHostname: argv.smtpHostname,
            smtpPort: argv.smtpPort,
            smtpSecure: argv.smtpSecure,
            smtpUsername: argv.smtpUsername || process.env.SMTP_USERNAME,
            smtpPassword: argv.smtpPassword || process.env.SMTP_PASSWORD
        }),
        alwaysSendToDefaultRecipient: argv.alwaysSendToDefaultRecipient
    })
);

console.log("Sync default email tpls to content API...");

const contentDirMapper = new CContentApiDirMapper(
    argv.contentApiUrl,
    argv.userId,
    argv.jwtSecret
);
contentDirMapper
    .syncFolder(path.join(__dirname, "..", "templates"), "emailTpls")
    .then(() => {
        console.log("Sync default email tpls to content API completed!");
        const listenPort = argv.listenPort;
        app.listen(listenPort);
        console.log("Listening on " + listenPort);
    })
    .catch(err => {
        console.error(
            "Failed to sync default email tpls to content API. Exiting...",
            err
        );
        process.exit(1);
    });

process.on("unhandledRejection", (reason: string, promise: any) => {
    console.error(reason);
});

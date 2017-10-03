require("isomorphic-fetch");
import * as cors from "cors";
import * as express from "express";
import * as path from "path";
import * as yargs from "yargs";

import Authenticator from "./Authenticator";
import createApiRouter from "./createApiRouter";
import createAuthRouter from "./createAuthRouter";
import createGenericProxy from "./createGenericProxy";

const argv = yargs
    .config()
    .help()
    .option("listenPort", {
        describe: "The TCP/IP port on which the gateway should listen.",
        type: "number",
        default: 6100
    })
    .option("externalUrl", {
        describe: "The base external URL of the gateway.",
        type: "string",
        default: "http://localhost:6100"
    })
    .option("dbHost", {
        describe: "The host running the session database.",
        type: "string",
        default: "localhost"
    })
    .option("dbPort", {
        describe: "The port running the session database.",
        type: "number",
        default: 5432
    })
    .option("proxyRoutesPath", {
        describe: "Path of the json that defines routes to proxy",
        type: "string",
        default: "../local-routes.json"
    })
    .option("authenticationApi", {
        describe: "The base URL of the authentication API.",
        type: "string",
        default: "http://localhost:6104/v0"
    })
    .option("previewMap", {
        describe: "The base URL of the preview map.",
        type: "string",
        default: "http://localhost:6110"
    })
    .option("web", {
        describe: "The base URL of the web site.",
        type: "string",
        default: "http://localhost:6108"
    })
    .option("jwtSecret", {
        describe:
            "The secret to use to sign JSON Web Token (JWT) for authenticated requests.  This can also be specified with the JWT_SECRET environment variable.",
        type: "string",
        default:
            process.env.JWT_SECRET || process.env.npm_package_config_JWT_SECRET,
        demand: true
    })
    .option("sessionSecret", {
        describe:
            "The secret to use to sign session cookies.  This can also be specified with the SESSION_SECRET environment variable.",
        type: "string",
        default:
            process.env.SESSION_SECRET ||
            process.env.npm_package_config_SESSION_SECRET,
        demand: true
    })
    .option("facebookClientId", {
        describe: "The client ID to use for Facebook OAuth.",
        type: "string"
    })
    .option("facebookClientSecret", {
        describe:
            "The secret to use for Facebook OAuth.  This can also be specified with the FACEBOOK_CLIENT_SECRET environment variable.",
        type: "string",
        default: process.env.FACEBOOK_CLIENT_SECRET
    })
    .option("googleClientId", {
        describe: "The client ID to use for Google OAuth.",
        type: "string"
    })
    .option("googleClientSecret", {
        describe:
            "The secret to use for Google OAuth.  This can also be specified with the GOOGLE_CLIENT_SECRET environment variable.",
        type: "string",
        default: process.env.GOOGLE_CLIENT_SECRET
    })
    .options("ckanUrl", {
        describe: "The URL of a CKAN server to use for authentication.",
        type: "string"
    }).argv;

const authenticator = new Authenticator({
    sessionSecret: argv.sessionSecret,
    dbHost: argv.dbHost,
    dbPort: argv.dbPort
});

// Create a new Express application.
var app = express();

const configuredCors = cors({
    origin: true,
    credentials: true
});

app.options("*", configuredCors);
app.use(configuredCors);

// Configure view engine to render EJS templates.
app.set("views", path.join(__dirname, "..", "views"));
app.set("view engine", "ejs");
app.use(require("morgan")("combined"));

app.use(
    "/auth",
    createAuthRouter({
        authenticator: authenticator,
        jwtSecret: argv.jwtSecret,
        facebookClientId: argv.facebookClientId,
        facebookClientSecret: argv.facebookClientSecret,
        googleClientId: argv.googleClientId,
        googleClientSecret: argv.googleClientSecret,
        ckanUrl: argv.ckanUrl,
        authenticationApi: argv.authenticationApi,
        externalUrl: argv.externalUrl
    })
);
app.use(
    "/api/v0",
    createApiRouter({
        authenticator: authenticator,
        jwtSecret: argv.jwtSecret,
        routes: require(argv.proxyRoutesPath)
    })
);
app.use("/preview-map", createGenericProxy(argv.previewMap));

// Proxy any other URL to magda-web
app.use("/", createGenericProxy(argv.web));

app.listen(argv.listenPort);
console.log("Listening on port " + argv.listenPort);

process.on("unhandledRejection", (reason: string, promise: any) => {
    console.error("Unhandled rejection");
    console.error(reason);
});

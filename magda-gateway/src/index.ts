import * as cors from "cors";
import * as express from "express";
import * as path from "path";
import * as yargs from "yargs";
import * as ejs from "ejs";
import * as helmet from "helmet";
import * as _ from "lodash";
import * as compression from "compression";

import addJwtSecretFromEnvVar from "@magda/typescript-common/dist/session/addJwtSecretFromEnvVar";

import Authenticator from "./Authenticator";
import createApiRouter from "./createApiRouter";
import createAuthRouter from "./createAuthRouter";
import createGenericProxy from "./createGenericProxy";
import createDGARedirectionRouter from "./createDGARedirectionRouter";
import defaultConfig from "./defaultConfig";

// Tell typescript about the semi-private __express field of ejs.
declare module "ejs" {
    var __express: any;
}

const coerceJson = (path?: string) => path && require(path);

const argv = addJwtSecretFromEnvVar(
    yargs
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
        .option("proxyRoutesJson", {
            describe:
                "Path of the json that defines routes to proxy. These will be merged with the defaults specified in defaultConfig.ts.",
            type: "string",
            coerce: coerceJson
        })
        .option("helmetJson", {
            describe:
                "Path of the json that defines node-helmet options, as per " +
                "https://helmetjs.github.io/docs/. Node that this _doesn't_ " +
                "include csp options as these are a separate module. These will " +
                "be merged with the defaults specified in defaultConfig.ts.",

            type: "string",
            coerce: coerceJson
        })
        .option("cspJson", {
            describe:
                "Path of the json that defines node-helmet options, as per " +
                "https://helmetjs.github.io/docs/. These will " +
                "be merged with the defaults specified in defaultConfig.ts.",
            type: "string",
            coerce: coerceJson
        })
        .option("corsJson", {
            describe:
                "Path of the json that defines CORS options, as per " +
                "https://www.npmjs.com/package/cors. These will " +
                "be merged with the defaults specified in defaultConfig.ts.",
            type: "string",
            coerce: coerceJson
        })
        .option("authorizationApi", {
            describe: "The base URL of the authorization API.",
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
            type: "string"
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
        })
        .options("enableAuthEndpoint", {
            describe: "Whether enable the AuthEndpoint",
            type: "boolean",
            default: false
        })
        .option("dgaRedirectionDomain", {
            describe:
                "The new domain where the DGA ckan system is located. If not specified, default value `ckan.data.gov.au` will be used.",
            type: "string",
            default: "ckan.data.gov.au"
        })
        .option("registryApiBaseUrlInternal", {
            describe: "The url of the registry api for use within the cluster",
            type: "string",
            default: "http://localhost:6101/v0",
            required: true
        })
        .option("userId", {
            describe:
                "The user id to use when making authenticated requests to the registry",
            type: "string",
            demand: true,
            default:
                process.env.USER_ID || process.env.npm_package_config_userId
        }).argv
);

const authenticator = new Authenticator({
    sessionSecret: argv.sessionSecret,
    dbHost: argv.dbHost,
    dbPort: argv.dbPort
});

// Create a new Express application.
var app = express();

// GZIP responses where appropriate
app.use(compression());

// Set sensible secure headers
app.disable("x-powered-by");
app.use(helmet(_.merge({}, defaultConfig.helmet, argv.helmetJson)));
console.log(_.merge({}, defaultConfig.csp, argv.cspJson));
app.use(
    helmet.contentSecurityPolicy(_.merge({}, defaultConfig.csp, argv.cspJson))
);

// Set up CORS headers for all requests
const configuredCors = cors(_.merge({}, defaultConfig.cors, argv.corsJson));
app.options("*", configuredCors);
app.use(configuredCors);

// Configure view engine to render EJS templates.
app.set("views", path.join(__dirname, "..", "views"));
app.set("view engine", "ejs");
app.engine(".ejs", ejs.__express); // This stops express trying to do its own require of 'ejs'
app.use(require("morgan")("combined"));

app.get("/v0/healthz", function(req, res) {
    res.status(200).send("OK");
});

if (argv.enableAuthEndpoint) {
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
            authorizationApi: argv.authorizationApi,
            externalUrl: argv.externalUrl,
            userId: argv.userId
        })
    );
}

app.use(
    "/api/v0",
    createApiRouter({
        authenticator: authenticator,
        jwtSecret: argv.jwtSecret,
        routes: _.merge({}, defaultConfig.proxyRoutes, argv.proxyRoutesJson)
    })
);
app.use("/preview-map", createGenericProxy(argv.previewMap));

app.use(
    createDGARedirectionRouter({
        dgaRedirectionDomain: argv.dgaRedirectionDomain,
        registryApiBaseUrlInternal: argv.registryApiBaseUrlInternal
    })
);

// Proxy any other URL to magda-web
app.use("/", createGenericProxy(argv.web));

app.listen(argv.listenPort);
console.log("Listening on port " + argv.listenPort);

process.on("unhandledRejection", (reason: string, promise: any) => {
    console.error("Unhandled rejection");
    console.error(reason);
});

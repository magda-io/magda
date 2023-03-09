import yargs from "yargs";
import _ from "lodash";
import express from "express";
import buildApp from "./buildApp";
import { createHttpTerminator } from "http-terminator";
import addJwtSecretFromEnvVar from "magda-typescript-common/src/session/addJwtSecretFromEnvVar";

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
        .option("webProxyRoutesJson", {
            describe:
                "Path of the json that defines web (non-API) routes to proxy.",
            type: "string",
            coerce: coerceJson
        })
        .option("authPluginConfigJson", {
            describe: "Auth plugin config.",
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
        .option("cookieJson", {
            describe:
                "Path of the json that defines cookie options, as per " +
                "https://github.com/expressjs/session#cookie. These will " +
                "be merged with the default options specified in Authenticator.ts.",
            type: "string",
            coerce: coerceJson
        })
        .option("authorizationApi", {
            describe: "The base URL of the authorization API.",
            type: "string",
            default: "http://localhost:6104/v0"
        })
        .option("skipAuth", {
            describe:
                "When set to true, API will not query policy engine for auth decision but assume it's always permitted. It's for debugging only.",
            type: "boolean",
            default: process.env.SKIP_AUTH == "true" ? true : false
        })
        .option("web", {
            describe: "The base URL of the web site.",
            type: "string",
            default: "http://localhost:6108"
        })
        .option("defaultWebRouteConfig", {
            describe: "Path of the json that defines default Web Route Config.",
            type: "string",
            coerce: coerceJson
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
        .options("enableAuthEndpoint", {
            describe: "Whether enable the AuthEndpoint",
            type: "boolean",
            default: false
        })
        .option("enableCkanRedirection", {
            describe: "Whether or not to turn on the CKan Redirection feature",
            type: "boolean",
            default: false
        })
        .option("ckanRedirectionDomain", {
            describe:
                "The target domain for redirecting ckan Urls. If not specified, default value `ckan.data.gov.au` will be used.",
            type: "string",
            default: "ckan.data.gov.au"
        })
        .option("ckanRedirectionPath", {
            describe:
                "The target path for redirecting ckan Urls. If not specified, default value `` will be used.",
            type: "string",
            default: ""
        })
        .option("registryQueryCacheStdTTL", {
            describe:
                "the standard ttl as number in seconds for every generated cache element in the registryQueryCache.",
            type: "number",
            default: 600
        })
        .option("registryQueryCacheMaxKeys", {
            describe:
                "specifies a maximum amount of keys that can be stored in the registryQueryCache. To disable the cache, set this value to `0`.",
            type: "number",
            default: 500
        })
        .option("enableWebAccessControl", {
            describe:
                "Whether users are required to enter a username & password to access the magda web interface",
            type: "boolean",
            default: false
        })
        .option("webAccessUsername", {
            describe:
                "The web access username required for all users to access Magda web interface if `enableWebAccessControl` is true.",
            type: "string",
            default: process.env.WEB_ACCESS_USERNAME
        })
        .option("webAccessPassword", {
            describe:
                "The web access password required for all users to access Magda web interface if `enableWebAccessControl` is true.",
            type: "string",
            default: process.env.WEB_ACCESS_PASSWORD
        })
        .option("enableHttpsRedirection", {
            describe: "Whether redirect any http requests to https URLs",
            type: "boolean",
            default: false
        })
        .option("userId", {
            describe:
                "The user id to use when making authenticated requests to the registry",
            type: "string",
            demand: true,
            default:
                process.env.USER_ID || process.env.npm_package_config_userId
        })
        .option("enableMultiTenants", {
            describe:
                "Whether to run in multi-tenant mode. If true, magdaAdminPortalName must refer to a real portal.",
            type: "boolean",
            default: false
        })
        .option("tenantUrl", {
            describe: "The base URL of the tenant API.",
            type: "string",
            default: "http://localhost:6130/v0"
        })
        .option("magdaAdminPortalName", {
            describe:
                "Magda admin portal host name. Must not be the same as gateway external URL or any other tenant website URL",
            type: "string",
            default: "unknown_portal_host_name"
        })
        .option("minReqIntervalInMs", {
            describe: "Minimal interval in ms to fetch tenants from DB.",
            type: "number",
            default: 60000
        })
        .option("openfaasGatewayUrl", {
            describe: "Internal openfaas gateway url",
            type: "string"
        })
        .option("defaultCacheControl", {
            describe:
                "A default value to put in the cache-control header of GET responses",
            type: "string"
        })
        .option("proxyTimeout", {
            describe:
                "How long time (in seconds) before upstream service must complete request in order to avoid request timeout error.",
            type: "string"
        }).argv
);

// Create a new Express application.
const app = express();
buildApp(app, argv as any);
const server = app.listen(argv.listenPort);
const httpTerminator = createHttpTerminator({
    server
});
console.log("Listening on port " + argv.listenPort);

process.on(
    "unhandledRejection",
    (reason: {} | null | undefined, promise: Promise<any>) => {
        console.error("Unhandled rejection");
        console.error(reason);
    }
);

process.on("SIGTERM", () => {
    console.log("SIGTERM signal received: closing HTTP server");
    httpTerminator.terminate().then(() => {
        console.log("HTTP server closed");
        process.exit(0);
    });
});

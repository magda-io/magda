import * as cors from "cors";
import * as express from "express";
import * as path from "path";
import * as yargs from "yargs";
import * as ejs from "ejs";
import * as helmet from "helmet";
import * as _ from "lodash";
import * as compression from "compression";
import * as basicAuth from "express-basic-auth";

import addJwtSecretFromEnvVar from "@magda/typescript-common/dist/session/addJwtSecretFromEnvVar";
import {
    installStatusRouter,
    createServiceProbe
} from "@magda/typescript-common/dist/express/status";

import Authenticator from "./Authenticator";
import createApiRouter from "./createApiRouter";
import createAuthRouter from "./createAuthRouter";
import createGenericProxy from "./createGenericProxy";
import createCkanRedirectionRouter from "./createCkanRedirectionRouter";
import createHttpsRedirectionMiddleware from "./createHttpsRedirectionMiddleware";
import defaultConfig from "./defaultConfig";
import loadTenantsTable from "./loadTenantsTable";
import { Tenant } from "@magda/typescript-common/dist/generated/registry/api";

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
            type: "string",
            default:
                process.env.FACEBOOK_CLIENT_ID ||
                process.env.npm_package_config_facebookClientId
        })
        .option("facebookClientSecret", {
            describe:
                "The secret to use for Facebook OAuth.  This can also be specified with the FACEBOOK_CLIENT_SECRET environment variable.",
            type: "string",
            default:
                process.env.FACEBOOK_CLIENT_SECRET ||
                process.env.npm_package_config_facebookClientSecret
        })
        .option("googleClientId", {
            describe: "The client ID to use for Google OAuth.",
            type: "string",
            default:
                process.env.GOOGLE_CLIENT_ID ||
                process.env.npm_package_config_googleClientId
        })
        .option("googleClientSecret", {
            describe:
                "The secret to use for Google OAuth.  This can also be specified with the GOOGLE_CLIENT_SECRET environment variable.",
            type: "string",
            default:
                process.env.GOOGLE_CLIENT_SECRET ||
                process.env.npm_package_config_googleClientSecret
        })
        .option("aafClientUri", {
            describe: "The aaf client Uri to use for AAF Auth.",
            type: "string",
            default:
                process.env.AAF_CLIENT_URI ||
                process.env.npm_package_config_aafClientUri
        })
        .option("aafClientSecret", {
            describe:
                "The secret to use for AAF Auth.  This can also be specified with the AAF_CLIENT_SECRET environment variable.",
            type: "string",
            default:
                process.env.AAF_CLIENT_SECRET ||
                process.env.npm_package_config_aafClientSecret
        })
        .options("ckanUrl", {
            describe: "The URL of a CKAN server to use for authentication.",
            type: "string"
        })
        .options("enableAuthEndpoint", {
            describe: "Whether enable the AuthEndpoint",
            type: "boolean",
            default: true
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
        }).argv
);

type Route = {
    to: string;
    auth?: boolean;
};

type Routes = {
    [host: string]: Route;
};

const routes = _.isEmpty(argv.proxyRoutesJson)
    ? defaultConfig.proxyRoutes
    : ((argv.proxyRoutesJson as unknown) as Routes);

const authenticator = new Authenticator({
    sessionSecret: argv.sessionSecret,
    dbHost: argv.dbHost,
    dbPort: argv.dbPort
});

const startIndex = argv.externalUrl.indexOf("//");
let endIndex = argv.externalUrl.lastIndexOf(":");
if (endIndex < 0) endIndex = argv.externalUrl.length;

export const magdaAdminPortalName = argv.externalUrl.substring(
    startIndex + 2,
    endIndex
);

// Create a new Express application.
var app = express();

// Log everything
app.use(require("morgan")("combined"));

const probes: any = {};

/**
 * Should use argv.routes to setup probes
 * so that no prob will be setup when run locally for testing
 */
_.forEach(
    (argv.proxyRoutesJson as unknown) as Routes,
    (value: any, key: string) => {
        probes[key] = createServiceProbe(value.to);
    }
);
installStatusRouter(app, { probes });

// Redirect http url to https
app.set("trust proxy", true);
app.use(createHttpsRedirectionMiddleware(argv.enableHttpsRedirection));

// GZIP responses where appropriate
app.use(compression());

// Set sensible secure headers
app.disable("x-powered-by");
app.use(helmet(_.merge({}, defaultConfig.helmet, argv.helmetJson as {})));
console.log(_.merge({}, defaultConfig.csp, argv.cspJson));
app.use(
    helmet.contentSecurityPolicy(_.merge({}, defaultConfig.csp, argv.cspJson))
);

// Set up CORS headers for all requests
const configuredCors = cors(
    _.merge({}, defaultConfig.cors, argv.corsJson as {})
);
app.options("*", configuredCors);
app.use(configuredCors);

// Configure view engine to render EJS templates.
app.set("views", path.join(__dirname, "..", "views"));
app.set("view engine", "ejs");
app.engine(".ejs", ejs.__express); // This stops express trying to do its own require of 'ejs'

// --- enable http basic authentication for all users
if (argv.enableWebAccessControl) {
    app.use(
        basicAuth({
            users: {
                [argv.webAccessUsername]: argv.webAccessPassword
            },
            challenge: true,
            unauthorizedResponse: `You cannot access the system unless provide correct username & password.`
        })
    );
}

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
            aafClientUri: argv.aafClientUri,
            aafClientSecret: argv.aafClientSecret,
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
        routes: routes
    })
);

app.use("/preview-map", createGenericProxy(argv.previewMap));

if (argv.enableCkanRedirection) {
    if (!routes.registry) {
        console.error("Cannot locate routes.registry for ckan redirection!");
    } else {
        app.use(
            createCkanRedirectionRouter({
                ckanRedirectionDomain: argv.ckanRedirectionDomain,
                ckanRedirectionPath: argv.ckanRedirectionPath,
                registryApiBaseUrlInternal: routes.registry.to
            })
        );
    }
}

// Proxy any other URL to magda-web
app.use("/", createGenericProxy(argv.web));

app.listen(argv.listenPort);
console.log("Listening on port " + argv.listenPort);

export let tenantsTable = new Map<String, Tenant>();
loadTenantsTable(tenantsTable, `${argv.externalUrl}/api/v0/registry`);

process.on("unhandledRejection", (reason: string, promise: any) => {
    console.error("Unhandled rejection");
    console.error(reason);
});

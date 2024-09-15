import { requireResolve } from "@magda/esm-utils";
import express from "express";
import path from "path";
import URI from "urijs";
import yargs from "yargs";
import morgan from "morgan";
import { createHttpTerminator } from "http-terminator";
import Registry from "magda-typescript-common/src/registry/RegistryClient.js";
import coerceJson from "magda-typescript-common/src/coerceJson.js";
import { MAGDA_ADMIN_PORTAL_ID } from "magda-typescript-common/src/registry/TenantConsts.js";

import buildSitemapRouter from "./buildSitemapRouter.js";
import getIndexFileContent from "./getIndexFileContent.js";
import getBasePathFromUrl from "magda-typescript-common/src/getBasePathFromUrl.js";
import standardiseUiBaseUrl from "./standardiseUiBaseUrl.js";
import createCralwerViewRouter from "./createCralwerViewRouter.js";
import moment from "moment-timezone";
import addTrailingSlash from "magda-typescript-common/src/addTrailingSlash.js";
import getAbsoluteUrl from "magda-typescript-common/src/getAbsoluteUrl.js";
import addRobotsMeta from "./addRobotsMeta.js";

const argv = yargs
    .config()
    .help()
    .option("listenPort", {
        describe: "The TCP/IP port on which the web server should listen.",
        type: "number",
        default: 6107
    })
    .option("disableAuthenticationFeatures", {
        describe: "True to disable all features that require authentication.",
        type: "boolean",
        default: false
    })
    .option("showNotificationBanner", {
        describe:
            "Whether or not the global notification banner should be shown",
        type: "boolean",
        default: false
    })
    .option("useLocalStyleSheet", {
        describe:
            "True to use prebuilt static stylesheet from web-client module.",
        type: "boolean",
        default: false
    })
    .option("baseExternalUrl", {
        describe:
            "The absolute base URL of the Magda site, when accessed externally. Used for building sitemap URLs which must be absolute.",
        type: "string",
        required: true
    })
    .option("authPluginRedirectUrl", {
        describe:
            "The redirect url after authentication plugin completes the auth process.",
        type: "string",
        default: "/sign-in-redirect"
    })
    .option("registryApiBaseUrlInternal", {
        describe: "The url of the registry api for use within the cluster",
        type: "string",
        default: "http://localhost:6101/v0",
        required: true
    })
    .option("baseUrl", {
        describe:
            "The base URL of the MAGDA Gateway, for building the base URLs of the APIs when not manually specified. Can be relative.",
        type: "string",
        default: "/"
    })
    .option("uiBaseUrl", {
        describe:
            "The base url where the UI serves at. If not specify (or empty string), it assumes the UI serves at '/'. It should have a leading slash, but no trailing slash",
        type: "string",
        default: "/"
    })
    .option("apiBaseUrl", {
        describe:
            "The base URL of the MAGDA API Gateway.  If not specified, the URL is built from the baseUrl.",
        type: "string"
    })
    .option("searchApiBaseUrl", {
        describe:
            "The base URL of the MAGDA Search API.  If not specified, the URL is built from the apiBaseUrl.",
        type: "string"
    })
    .option("contentApiBaseUrl", {
        describe:
            "The base _EXTERNAL_ URL of the MAGDA Content API.  If not specified, the URL is built from the apiBaseUrl.",
        type: "string"
    })
    .option("contentApiBaseUrlInternal", {
        describe:
            "The base _INTERNAL_ URL of the MAGDA Content API.  If not specified, the URL is built from the apiBaseUrl.",
        type: "string"
    })
    .option("registryApiBaseUrl", {
        describe:
            "The base URL of the MAGDA Registry API.  If not specified, the URL is built from the apiBaseUrl.",
        type: "string"
    })
    .option("indexerApiBaseUrl", {
        describe:
            "The base URL of the MAGDA Indexer API.  If not specified, the URL is built from the apiBaseUrl.",
        type: "string"
    })
    .option("registryApiReadOnlyBaseUrl", {
        describe:
            "The base URL of the MAGDA Registry API for use for read-only operations.  If not specified, the URL is built from the apiBaseUrl.",
        type: "string"
    })
    .option("authApiBaseUrl", {
        describe:
            "The base URL of the MAGDA Auth API.  If not specified, the URL is built from the apiBaseUrl.",
        type: "string"
    })
    .option("adminApiBaseUrl", {
        describe:
            "The base URL of the MAGDA admin API.  If not specified, the URL is built from the apiBaseUrl.",
        type: "string"
    })
    .option("previewMapBaseUrl", {
        describe:
            "The base URL of the Magda preview map.  If not specified, the URL is built from the apiBaseUrl.",
        type: "string"
    })
    .option("correspondenceApiBaseUrl", {
        describe:
            "The base URL of the correspondence api.  If not specified, the URL is built from the apiBaseUrl.",
        type: "string"
    })
    .option("storageApiBaseUrl", {
        describe:
            "The base URL of the storage api.  If not specified, the URL is built from the apiBaseUrl.",
        type: "string"
    })
    .option("openfaasBaseUrl", {
        describe:
            "The base URL of the openfaas gateway.  If not specified, the URL is built from the apiBaseUrl.",
        type: "string"
    })
    .option("fallbackUrl", {
        describe:
            "An older system to fall back to - this url will be shown in a banner that says 'you can still go back to old site'.",
        type: "string"
    })
    .option("gapiIds", {
        describe: "Google Analytics ID(s)",
        type: "array",
        default: []
    })
    .option("featureFlags", {
        describe:
            "A map of feature flags ids to booleans, turning feature flags on/off",
        type: "string",
        coerce: coerceJson("requestOpts"),
        default: "{}"
    })
    .option("useMagdaStorageByDefault", {
        describe: "Whether use magda to store dataset data files by default",
        type: "boolean",
        default: true
    })
    .option("vocabularyApiEndpoints", {
        describe: "A list of Vocabulary API Endpoints",
        type: "string",
        coerce: coerceJson("vocabularyApiEndpoints"),
        default: "[]"
    })
    .option("defaultOrganizationId", {
        describe: "The id of a default organization to use for new datasets",
        type: "string",
        required: false
    })
    .option("defaultContactEmail", {
        describe:
            "Default contact email for users to report magda system errors",
        type: "string"
    })
    .option("custodianOrgLevel", {
        describe: "Data custodian org unit tree level",
        type: "number"
    })
    .option("automaticPreviewMaxFileSize", {
        describe:
            "The maximum size (in bytes) to automatically preview a file in the UI. If the file is determined to be over this size the user will be prompted before previewing",
        type: "number"
    })
    .option("mandatoryFields", {
        describe: "Add dataset page mandatory fields list (in JSON path)",
        type: "string",
        coerce: coerceJson("mandatoryFields"),
        default: "[]"
    })
    .option("dateConfig", {
        describe: "A date format config for date extract from data file",
        type: "string",
        coerce: coerceJson("dateConfig"),
        default: "[]"
    })
    .option("datasetThemes", {
        describe:
            "A list of pre-defined phrases for theme input on the `add dataset page`",
        type: "string",
        coerce: coerceJson("datasetThemes"),
        default: "[]"
    })
    .option("noManualKeywords", {
        describe:
            "Whether manual keywords input should be allowed on add dataset page",
        type: "boolean",
        default: false
    })
    .option("noManualThemes", {
        describe:
            "Whether manual themes input should be allowed on add dataset page",
        type: "boolean",
        default: false
    })
    .option("keywordsBlackList", {
        describe:
            "A list of pre-defined BlackList for auto keywords generation",
        type: "string",
        coerce: coerceJson("keywordsBlackList"),
        default: "[]"
    })
    .option("enableCrawlerViews", {
        describe:
            "Whether enable crawler html view for crawlers that has limited rendering capability. When `enableDiscourseSupport` is true, this will be overwritten to true.",
        type: "boolean",
        default: true
    })
    .option("discourseSiteUrl", {
        describe:
            "discourse Site Url. Set this value in order to enable discourse posts integration on dataset or distribution page",
        type: "string"
    })
    .option("discourseIntegrationDatasetPage", {
        describe:
            "Whether or not to enable discourse posts integration on dataset page",
        type: "boolean",
        default: true
    })
    .option("discourseIntegrationDistributionPage", {
        describe:
            "Whether or not to enable discourse posts integration on distribution page",
        type: "boolean",
        default: true
    })
    .option("defaultTimeZone", {
        describe: "default time zone used when display time string",
        type: "string",
        default: "Australia/Sydney"
    })
    .option("homePageUrl", {
        describe: "an alternative home page url.",
        type: "string"
    })
    .option("supportExternalTerriaMapV7", {
        describe:
            "When set to true, the `Open in National Map` button in Map Preview area will send data in v7 format",
        type: "boolean",
        default: false
    })
    .option("openInExternalTerriaMapButtonText", {
        describe:
            "When set, the string here will replace the text of the `Open in National Map` button in Map Preview area.",
        type: "string"
    })
    .option("openInExternalTerriaMapTargetUrl", {
        describe:
            "When set, the `Open in National Map` button in Map Preview area will sent map data to the URL provided",
        type: "string"
    })
    .option("externalUIComponents", {
        describe: "a list of external UI component JS bundle file urls",
        type: "string",
        coerce: coerceJson("externalUIComponents"),
        default: [] as string[]
    })
    .option("externalCssFiles", {
        describe: "a list of external UI component JS bundle file urls",
        type: "string",
        coerce: coerceJson("externalUIComponents"),
        default: [] as string[]
    })
    .option("extraConfigData", {
        describe: "Extra config data for external UI plugins.",
        type: "string",
        coerce: coerceJson("extraConfigData"),
        default: "{}"
    })
    .option("previewMapFormatPerference", {
        describe: "Preview map module format perference list",
        type: "string",
        coerce: coerceJson("previewMapFormatPerference"),
        default: undefined // allow passing [] to explictely turn all map preview off
    })
    .option("showContactButtonForNoContactPointDataset", {
        describe:
            "Whether show the 'Ask a question about this dataset' button for datasets without contact point info.",
        type: "boolean",
        default: false
    })
    .option("defaultDatasetBucket", {
        describe: "Default bucket for storing datasets",
        type: "string"
    })
    .option("anonymousUserLandingPage", {
        describe: "Specify the landing page uri for anonymous users",
        default: "/home",
        type: "string"
    })
    .option("authenticatedUserLandingPage", {
        describe: "Specify the landing page uri for authenticated users",
        default: "/home",
        type: "string"
    })
    .option("authStatusRefreshInterval", {
        describe:
            "The interval of UI refresh / refetch user auth status data. Default to 5 mins.",
        default: 300000,
        type: "number"
    })
    .option("sitemapCacheSeconds", {
        describe:
            "No. of seconds that sitemap result will be cached. By default, 86400 i.e. 1 day.",
        default: 86400,
        type: "number"
    }).argv;

// set default timezone
moment.tz.setDefault(argv.defaultTimeZone);

const app = express();

app.use(morgan("combined"));

app.get("/status/ready", (req, res) => {
    res.status(200).send("OK");
});

app.get("/status/live", (req, res) => {
    res.status(200).send("OK");
});

const clientRoot = path.resolve(
    requireResolve("@magda/web-client/package.json"),
    ".."
);
const clientBuild = path.join(clientRoot, "build");
console.log("Client: " + clientBuild);

const baseExternalUrl = argv?.baseExternalUrl
    ? addTrailingSlash(argv.baseExternalUrl)
    : "";
const appBasePath = getBasePathFromUrl(baseExternalUrl);
const uiBaseUrl = addTrailingSlash(
    standardiseUiBaseUrl(
        argv.uiBaseUrl && argv.uiBaseUrl !== "/"
            ? argv.uiBaseUrl
            : appBasePath
            ? appBasePath
            : ""
    )
);
const baseUrl = addTrailingSlash(
    argv.baseUrl && argv.baseUrl !== "/"
        ? argv.baseUrl
        : appBasePath
        ? appBasePath
        : "/"
);
const apiBaseUrl = addTrailingSlash(
    argv.apiBaseUrl || new URI(baseUrl).segment("api").toString()
);

const webServerConfig = {
    image: argv.image,
    disableAuthenticationFeatures: argv.disableAuthenticationFeatures,
    baseUrl: baseUrl,
    baseExternalUrl,
    uiBaseUrl,
    authPluginRedirectUrl: argv.authPluginRedirectUrl
        ? argv.authPluginRedirectUrl
        : "",
    apiBaseUrl: apiBaseUrl,
    contentApiBaseUrl: addTrailingSlash(
        argv.contentApiBaseUrl ||
            new URI(apiBaseUrl).segment("v0").segment("content").toString()
    ),
    searchApiBaseUrl: addTrailingSlash(
        argv.searchApiBaseUrl ||
            new URI(apiBaseUrl).segment("v0").segment("search").toString()
    ),
    indexerApiBaseUrl: addTrailingSlash(
        argv.indexerApiBaseUrl ||
            new URI(apiBaseUrl).segment("v0").segment("indexer").toString()
    ),
    registryApiBaseUrl: addTrailingSlash(
        argv.registryApiBaseUrl ||
            new URI(apiBaseUrl).segment("v0").segment("registry").toString()
    ),
    registryApiReadOnlyBaseUrl: addTrailingSlash(
        argv.registryApiReadOnlyBaseUrl ||
            new URI(apiBaseUrl)
                .segment("v0")
                .segment("registry-read-only")
                .toString()
    ),
    authApiBaseUrl: addTrailingSlash(
        argv.authApiBaseUrl ||
            new URI(apiBaseUrl).segment("v0").segment("auth").toString()
    ),
    adminApiBaseUrl: addTrailingSlash(
        argv.adminApiBaseUrl ||
            new URI(apiBaseUrl).segment("v0").segment("admin").toString()
    ),
    previewMapBaseUrl: addTrailingSlash(
        argv.previewMapBaseUrl ||
            new URI(baseUrl).segment("preview-map").toString()
    ),
    correspondenceApiBaseUrl: addTrailingSlash(
        argv.correspondenceApiBaseUrl ||
            new URI(apiBaseUrl)
                .segment("v0")
                .segment("correspondence")
                .toString()
    ),
    storageApiBaseUrl: addTrailingSlash(
        argv.storageApiBaseUrl ||
            new URI(apiBaseUrl).segment("v0").segment("storage").toString()
    ),
    openfaasBaseUrl: addTrailingSlash(
        argv.openfaasBaseUrl ||
            new URI(apiBaseUrl).segment("v0").segment("openfaas").toString()
    ),
    fallbackUrl: argv.fallbackUrl,
    gapiIds: argv.gapiIds,
    showNotificationBanner: argv.showNotificationBanner,
    featureFlags: argv.featureFlags || {},
    useMagdaStorageByDefault: argv.useMagdaStorageByDefault,
    vocabularyApiEndpoints: (argv.vocabularyApiEndpoints || []) as string[],
    defaultOrganizationId: argv.defaultOrganizationId,
    defaultContactEmail: argv.defaultContactEmail,
    custodianOrgLevel: argv.custodianOrgLevel,
    automaticPreviewMaxFileSize: argv.automaticPreviewMaxFileSize,
    mandatoryFields: argv.mandatoryFields,
    dateConfig: argv.dateConfig,
    datasetThemes: argv.datasetThemes,
    noManualKeywords: argv.noManualKeywords,
    noManualThemes: argv.noManualThemes,
    keywordsBlackList: argv.keywordsBlackList,
    discourseSiteUrl: argv.discourseSiteUrl,
    discourseIntegrationDatasetPage: argv.discourseIntegrationDatasetPage,
    discourseIntegrationDistributionPage:
        argv.discourseIntegrationDistributionPage,
    defaultTimeZone: argv.defaultTimeZone,
    externalUIComponents: argv.externalUIComponents,
    externalCssFiles: argv.externalCssFiles,
    homePageUrl: argv.homePageUrl,
    supportExternalTerriaMapV7: argv.supportExternalTerriaMapV7,
    openInExternalTerriaMapButtonText: argv.openInExternalTerriaMapButtonText,
    openInExternalTerriaMapTargetUrl: argv.openInExternalTerriaMapTargetUrl,
    extraConfigData: argv.extraConfigData,
    previewMapFormatPerference: argv.previewMapFormatPerference,
    showContactButtonForNoContactPointDataset:
        argv.showContactButtonForNoContactPointDataset,
    defaultDatasetBucket: argv.defaultDatasetBucket,
    anonymousUserLandingPage: argv.anonymousUserLandingPage,
    authenticatedUserLandingPage: argv.authenticatedUserLandingPage,
    authStatusRefreshInterval: argv.authStatusRefreshInterval
};

app.get("/server-config.js", function (req, res) {
    res.type("application/javascript");
    res.send(
        "window.magda_server_config = " + JSON.stringify(webServerConfig) + ";"
    );
});

/**
 * Get the index file content according to the passed in settings. Because getIndexFileContent
 * is throttled, it'll only actually be invoked once every 60 seconds
 */
function getIndexFileContentZeroArgs() {
    return getIndexFileContent(
        clientRoot,
        argv.useLocalStyleSheet,
        argv.contentApiBaseUrlInternal,
        uiBaseUrl,
        appBasePath,
        argv.externalUIComponents,
        argv.externalCssFiles
    );
}

app.get(["/", "/index.html*"], async function (req, res) {
    const indexFileContent = await getIndexFileContentZeroArgs();

    res.send(indexFileContent);
});

// app.use("/admin", express.static(adminBuild));
app.use(express.static(clientBuild));

console.log("enableCrawlerViews: ", argv.enableCrawlerViews);

const enableDiscourseSupport: boolean =
    !!argv.discourseSiteUrl &&
    (argv.discourseIntegrationDatasetPage ||
        argv.discourseIntegrationDistributionPage);

console.log("Is Discourse Integration Enabled: ", enableDiscourseSupport);

// crawler view router
if (argv.enableCrawlerViews || enableDiscourseSupport) {
    app.use(
        createCralwerViewRouter({
            registryApiBaseUrl: argv.registryApiBaseUrlInternal,
            enableDiscourseSupport: enableDiscourseSupport,
            uiBaseUrl
        })
    );
}

// URLs in this list will load index.html and be handled by React routing.
const topLevelRoutes = [
    "admin",
    "search",
    "drafts",
    "all-datasets",
    "feedback",
    "contact",
    "account",
    "sign-in-redirect",
    "dataset",
    "projects",
    "publishers", // Renamed to "/organisations" but we still want to redirect it in the web client
    "organisations",
    "suggest",
    "error",
    "settings",
    "home"
];

const allowToCrawlRoutes = ["dataset", "home"];

topLevelRoutes.forEach((topLevelRoute) => {
    const routeHandle = async function (
        req: express.Request,
        res: express.Response
    ) {
        if (allowToCrawlRoutes.indexOf(topLevelRoute) != -1) {
            // allow search engine robot to crawl. Thus, no robots meta tag.
            res.send(await getIndexFileContentZeroArgs());
        } else {
            res.send(addRobotsMeta(await getIndexFileContentZeroArgs()));
        }
    };
    app.get("/" + topLevelRoute, routeHandle);
    app.get("/" + topLevelRoute + "/*", routeHandle);
});

app.get("/page/*", async function (req, res) {
    res.send(await getIndexFileContentZeroArgs());
});

const robotsTxt = `User-agent: *
Crawl-delay: 100
Disallow: /auth
Disallow: ${uiBaseUrl}search
Disallow: ${uiBaseUrl}organisations
Disallow: ${uiBaseUrl}*?*q=*

Sitemap: ${getAbsoluteUrl(
    uiBaseUrl,
    baseExternalUrl ? baseExternalUrl : "/"
)}sitemap.xml
`;

app.use("/robots.txt", (_, res) => {
    res.setHeader("content-type", "text/plain");
    res.status(200).send(robotsTxt);
});

// TODO: Use proper tenant id in multi-tenant mode.
app.use(
    buildSitemapRouter({
        baseExternalUrl,
        uiBaseUrl,
        registry: new Registry({
            baseUrl: argv.registryApiBaseUrlInternal,
            maxRetries: 0,
            tenantId: MAGDA_ADMIN_PORTAL_ID
        }),
        cacheSeconds: argv.sitemapCacheSeconds
    })
);

// Proxy any other URL to 404 error page
const maxErrorDataUrlLength = 1500;
app.use("/", function (req, res) {
    let redirectUri: any = new URI("/error");
    const url =
        req.originalUrl.length > maxErrorDataUrlLength
            ? req.originalUrl.substring(0, maxErrorDataUrlLength)
            : req.originalUrl;
    const errorData = {
        errorCode: 404,
        url: url
    };
    redirectUri = redirectUri.escapeQuerySpace(false).search(errorData);
    res.redirect(303, redirectUri.toString());
});

const server = app.listen(argv.listenPort);
const httpTerminator = createHttpTerminator({
    server
});
console.log("Listening on port " + argv.listenPort);

process.on(
    "unhandledRejection",
    (reason: {} | null | undefined, promise: Promise<any>) => {
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

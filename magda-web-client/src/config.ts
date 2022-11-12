import Publisher from "./Components/Dataset/Search/Facets/Publisher";
import Format from "./Components/Dataset/Search/Facets/Format";
import Region from "./Components/Dataset/Search/Facets/Region";
import Temporal from "./Components/Dataset/Search/Facets/Temporal";
import { ValidationFieldList } from "./Components/Dataset/Add/ValidationManager";
import urijs from "urijs";
import removePathPrefix from "./helpers/removePathPrefix";
import { ADMIN_USERS_ROLE_ID } from "@magda/typescript-common/dist/authorization-api/constants";
import AuthDecisionQueryClient from "@magda/typescript-common/dist/opa/AuthDecisionQueryClient";
import { Component } from "react";

export const ADMIN_ROLE_ID = ADMIN_USERS_ROLE_ID;

declare global {
    interface Window {
        magda_server_config: any;
    }
}

// https://www.w3.org/TR/NOTE-datetime
const defaultDateFormats: string[] = [
    // Year
    "YYYY",
    // Year and month (eg 1997-07)
    "YYYY-MM",
    // Complete date (eg 1997-07-16):
    "DD-MM-YYYY",
    "MM-DD-YYYY",
    "YYYY-MM-DD",
    // Complete date plus hours and minutes (eg 1997-07-16T19:20+01:00):
    "YYYY-MM-DDThh:mmTZD",
    // Complete date plus hours, minutes and seconds (eg 1997-07-16T19:20:30+01:00):
    "YYYY-MM-DDThh:mm:ssTZD",
    // Complete date plus hours, minutes, seconds and a decimal fraction of a second (eg 1997-07-16T19:20:30.45+01:00)
    "YYYY-MM-DDThh:mm:ss.sTZD",
    // Natural language date formats (eg 12 March, 1997)
    "DD-MMM-YYYY",
    "MMM-DD-YYYY"
];

// Local minikube/docker k8s cluster
// const fallbackApiHost = "http://localhost:30100/";
// Dev server
const fallbackApiHost = "https://dev.magda.io/";

const DEV_FEATURE_FLAGS: FeatureFlagsConfigType = {
    cataloguing: true,
    publishToDga: false,
    previewAddDataset: false,
    datasetApprovalWorkflowOn: false,
    useStorageApi: true,
    datasetLikeButton: false,
    enableAutoMetadataFetchButton: true
};

export type FeatureFlagType =
    | "cataloguing"
    | "publishToDga"
    | "previewAddDataset"
    | "datasetApprovalWorkflowOn"
    | "useStorageApi"
    | "datasetLikeButton"
    | "enableAutoMetadataFetchButton";

export type FeatureFlagsConfigType = Partial<Record<FeatureFlagType, boolean>>;

interface DateConfig {
    dateFormats: string[];
    dateRegexes: {
        dateRegex: RegExp;
        startDateRegex: RegExp;
        endDateRegex: RegExp;
    };
}

export interface RawPreviewMapFormatPerferenceItem {
    format: string;
    isDataFile?: boolean;
    urlRegex?: string;
}

export interface FacetConfigItem {
    id: string;
    component: Component<any>;
    showExplanation?: boolean;
    name?: string;
}

/**
 * Magda frontend application configuration data structure.
 * This config data is only configurable at time of the deployment via [Magda web-server Helm Chart](https://github.com/magda-io/magda/tree/master/deploy/helm/internal-charts/web-server).
 * At the beginning of starting up, the frontend application will retrieve this config data from the web server.
 *
 * @export
 * @interface ConfigDataType
 */
export interface ConfigDataType {
    /**
     * Although the field name `credentialsFetchOptions`, the field allow you to config all [fetch requests](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch) sent by the frontend application.
     * The most common settings is [credentials field](https://developer.mozilla.org/en-US/docs/Web/API/Request/Request#credentials).
     * Its default value is `"credentials": "same-origin"`. When running the web client locally for debugging purpose, you might want to set it to `"credentials": "include"`.
     * This will allow `credentials` (e.g. cookie) to be shared with remote dev testing API server.
     *
     * @type {RequestInit}
     * @memberof ConfigDataType
     */
    credentialsFetchOptions: RequestInit;

    /**
     * The docker image information of the web server that serves all frontend resources of the application.
     *
     * @type {{
     *         pullPolicy?: string;
     *         repository?: string;
     *         tag?: string;
     *     }}
     * @memberof ConfigDataType
     */
    image?: {
        pullPolicy?: string;
        repository?: string;
        tag?: string;
    };

    /**
     * The authorisation API base URL supplied by server side.
     * The value of this field will be used to populate field `authApiUrl`.
     * When this value is not available (e.g. run web client locally), `authApiUrl` will be set to the authorisation API url of a default ("fallback") dev API server.
     *
     * @type {string}
     * @memberof ConfigDataType
     */
    authApiBaseUrl?: string;

    /**
     * The authorisation API base URL endpoint.
     * Its value is either populated from config data retrieved from the server (i.e. `authApiBaseUrl` field).
     * Or a default value that points to "fallback" dev API server.
     * Frontend app use this value of this field to construct the full URLs to access all different content APIs.
     *
     * @type {string}
     * @memberof ConfigDataType
     */
    authApiUrl?: string;

    /**
     * The base URL path of all APIs (e.g. '/');
     * The value of the field might either from config data retrieved from the server or the URL to a default "fallback" dev API server url for testing.
     *
     * @type {string}
     * @memberof ConfigDataType
     */
    baseUrl?: string;

    /**
     * The default redirection url for all auth plugins once the authentication process is completed.
     *
     * @type {string}
     * @memberof ConfigDataType
     */
    authPluginRedirectUrl?: string;

    /**
     * Similar to `baseUrl`. But this field includes the external access domain of the application.
     * You might want to use its value in use cases e.g. generating external accessible links.
     *
     * @type {string}
     * @memberof ConfigDataType
     */
    baseExternalUrl?: string;

    /**
     * The base url path where the web client will be served at.
     * E.g.  when `uiBaseUrl`=`/`, the web client will served at `https://example.com/`.
     * When `uiBaseUrl`=`/abc/def`, the web client will served at `https://example.com/abc/def`.
     * Please note: this field only reflect where the wbe client / frontend application is served at.
     * It doesn't reflect where all APIs are served. To find out it, the value `baseUrl` field should be used.
     *
     * @type {string}
     * @memberof ConfigDataType
     */
    uiBaseUrl?: string;

    /**
     * Whether or not the notification banner should be shown.
     *
     * @type {boolean}
     * @memberof ConfigDataType
     */
    showNotificationBanner?: boolean;

    /**
     * The content API base URL supplied by server side.
     * The value of this field will be used to populate field `contentApiURL`.
     * When this value is not available (e.g. run web client locally), `contentApiURL` will be set to the content API url of a default ("fallback") dev API server.
     *
     * @type {string}
     * @memberof ConfigDataType
     */
    contentApiBaseUrl?: string;

    /**
     * The content API base URL endpoint.
     * Its value is either populated from config data retrieved from the server (i.e. `contentApiBaseUrl` field).
     * Or a default value that points to "fallback" dev API server.
     * Frontend app use this value of this field to construct the full URLs to access all different content APIs.
     *
     * @type {string}
     * @memberof ConfigDataType
     */
    contentApiURL?: string;

    /**
     * The API URL to retrieve all default content items (e.g. header & footer items etc.).
     * The value of this field is created from field `contentApiURL`.
     *
     * @type {string}
     * @memberof ConfigDataType
     */
    contentUrl?: string;
    previewMapBaseUrl?: string;
    indexerApiBaseUrl?: string;
    registryApiBaseUrl?: string;
    registryApiReadOnlyBaseUrl?: string;
    registryReadOnlyApiUrl?: string;
    registryFullApiUrl?: string;
    searchApiBaseUrl?: string;
    searchApiUrl?: string;
    correspondenceApiBaseUrl?: string;
    correspondenceApiUrl?: string;
    storageApiBaseUrl?: string;
    storageApiUrl?: string;

    /**
     * Google Analytics ID
     *
     * @type {Array<string>}
     * @memberof ConfigDataType
     */
    gapiIds?: Array<string>;
    adminApiBaseUrl?: string;
    adminApiUrl?: string;
    previewMapUrl?: string;
    proxyUrl?: string;
    rssUrl?: string;
    disableAuthenticationFeatures?: boolean;

    /**
     * The url of fallback dev API server for testing.
     * It will only be used when the web client is run locally.
     *
     * @type {string}
     * @memberof ConfigDataType
     */
    fallbackUrl?: string;

    /**
     * A set of feature flags to turn on/of a list of features.
     *
     * @type {{
     *         [id: string]: boolean;
     *     }}
     * @memberof ConfigDataType
     */
    featureFlags?: FeatureFlagsConfigType;

    useMagdaStorageByDefault?: boolean;
    vocabularyApiEndpoints: string[];
    defaultOrganizationId?: string;
    defaultContactEmail?: string;
    custodianOrgLevel: number;

    /**
     * The maximum size that a file can be in order to be automatically previewed by the ui as a map, graph or table.
     *
     * @type {number}
     * @memberof ConfigDataType
     */
    automaticPreviewMaxFileSize: number;
    mandatoryFields: ValidationFieldList;
    dateConfig?: DateConfig;
    noManualKeywords?: boolean;
    noManualThemes?: boolean;
    datasetThemes?: string[];
    keywordsBlackList?: string[];
    openfaasBaseUrl?: string;
    ckanExportServers: {
        [ckanServerUrl: string]: boolean;
    };
    defaultCkanServer: string;
    defaultTimeZone?: string;
    enableCrawlerViews?: boolean;
    discourseSiteUrl?: string;
    discourseIntegrationDatasetPage?: boolean;
    discourseIntegrationDistributionPage?: boolean;
    externalUIComponents?: string[];
    externalCssFiles?: string[];
    homePageUrl?: string;
    breakpoints?: {
        small: number;
        medium: number;
        large: number;
    };
    facets?: FacetConfigItem[];
    headerLogoUrl?: string;
    headerMobileLogoUrl?: string;
    /**
     * A list of month name to be used in the application
     *
     * @type {string[]}
     * @memberof ConfigDataType
     */
    months?: string[];
    /**
     * Default boundingBox for map preview module
     *
     * @type {{
     *         west: number;
     *         south: number;
     *         east: number;
     *         north: number;
     *     }}
     * @memberof ConfigDataType
     */
    boundingBox?: {
        west: number;
        south: number;
        east: number;
        north: number;
    };
    supportExternalTerriaMapV7?: boolean;
    openInExternalTerriaMapButtonText?: string;
    openInExternalTerriaMapTargetUrl?: string;

    /**
     * extraConfigData is mainly for config data passing to external UI plugins
     *
     * @type {{
     *         [key: string]: any;
     *     }}
     * @memberof ConfigDataType
     */
    extraConfigData?: {
        [key: string]: any;
    };
    previewMapFormatPerference?: RawPreviewMapFormatPerferenceItem[];
    showContactButtonForNoContactPointDataset?: boolean;
    defaultDatasetBucket?: string;
    anonymousUserLandingPage?: string;
    authenticatedUserLandingPage?: string;
    /**
     * How long before reload the current user's auth data in the background.
     * Useful to transit UI to correct status when user leave browser open without interaction for long time.
     * Default: 5 mins
     *
     * @type {number}
     * @memberof ConfigDataType
     */
    authStatusRefreshInterval?: number;
}

const serverConfig: ConfigDataType = window.magda_server_config || {};

const DATE_REGEX = ".*(date|dt|year|decade).*";
const START_DATE_REGEX = "(start|st).*(date|dt|year|decade)";
const END_DATE_REGEX = "(end).*(date|dt|year|decade)";

/**
 * Given the server's date config object, tries to construct a date config object
 * that also includes defaults for parts of the config that are not specified
 * @param serverDateConfig Server's Date Config object
 */
function constructDateConfig(
    serverDateConfig: DateConfig | undefined
): DateConfig {
    const dateConfig: DateConfig = {
        dateFormats: defaultDateFormats,
        dateRegexes: {
            dateRegex: new RegExp(DATE_REGEX, "i"),
            startDateRegex: new RegExp(START_DATE_REGEX, "i"),
            endDateRegex: new RegExp(END_DATE_REGEX, "i")
        }
    };

    // Overwriting config if there is config coming from the server
    if (serverDateConfig) {
        if (serverDateConfig.dateFormats) {
            dateConfig.dateFormats = serverDateConfig.dateFormats;
        }
        // If the server date config exists, and regexes were also specified
        if (serverDateConfig.dateRegexes) {
            dateConfig["dateRegexes"] = {
                dateRegex: new RegExp(
                    serverDateConfig.dateRegexes.dateRegex || DATE_REGEX,
                    "i"
                ),
                startDateRegex: new RegExp(
                    serverDateConfig.dateRegexes.startDateRegex ||
                        START_DATE_REGEX,
                    "i"
                ),
                endDateRegex: new RegExp(
                    serverDateConfig.dateRegexes.endDateRegex || END_DATE_REGEX,
                    "i"
                )
            };
        }
    }
    return dateConfig;
}

const baseUrl = serverConfig.baseUrl || fallbackApiHost;
export const isLocalUiServer = window.magda_server_config ? true : false;
export const isBackendSameOrigin =
    baseUrl.toLowerCase().indexOf("http") !== 0 ||
    urijs(baseUrl.toLowerCase()).segment([]).toString() ===
        urijs().segment([]).search("").fragment("").toString()
        ? true
        : false;

const registryReadOnlyApiUrl =
    serverConfig.registryApiReadOnlyBaseUrl ||
    fallbackApiHost + "api/v0/registry-read-only/";
const registryFullApiUrl =
    serverConfig.registryApiBaseUrl || fallbackApiHost + "api/v0/registry/";

const previewMapUrl =
    serverConfig.previewMapBaseUrl || fallbackApiHost + "preview-map/";
const proxyUrl = getProxyUrl();

/**
 * if serverConfig.baseExternalUrl not exist:
 * - uses browser current url if serverConfig exists (i.e. we didn't use the `fallbackApiHost`)
 * - otherwise, use fallbackApiHost
 */
const baseExternalUrl = serverConfig.baseExternalUrl
    ? serverConfig.baseExternalUrl
    : isBackendSameOrigin
    ? baseUrl
    : urijs().segment([]).search("").fragment("").toString();

// when UI domain is different from backend domain, we set credentials: "include"
export const credentialsFetchOptions: RequestInit = !isBackendSameOrigin
    ? {
          credentials: "include"
      }
    : {
          credentials: "same-origin"
      };

AuthDecisionQueryClient.fetchOptions = { ...credentialsFetchOptions };

const contentApiURL =
    serverConfig.contentApiBaseUrl || fallbackApiHost + "api/v0/content/";

const vocabularyApiEndpoints =
    Array.isArray(serverConfig.vocabularyApiEndpoints) &&
    serverConfig.vocabularyApiEndpoints.length
        ? serverConfig.vocabularyApiEndpoints
        : // --- default endpoints
          [
              "https://vocabs.ands.org.au/repository/api/lda/abares/australian-land-use-and-management-classification/version-8/concept.json",
              "https://vocabs.ands.org.au/repository/api/lda/ands-nc/controlled-vocabulary-for-resource-type-genres/version-1-1/concept.json"
          ];

let defaultCkanServer: string;
if (process.env.NODE_ENV === "development") {
    defaultCkanServer = "https://demo.ckan.org";
} else {
    defaultCkanServer = "https://data.gov.au/data";
}
defaultCkanServer = "https://demo.ckan.org";

const ckanExportServers = {
    [defaultCkanServer]: true
};

function getFullUrlIfNotEmpty(relativeUrl: string | undefined) {
    if (!relativeUrl) {
        return relativeUrl;
    } else if (relativeUrl.indexOf("http") !== 0) {
        // --- avoid produce "//" in url
        return (
            baseExternalUrl.replace(/\/$/, "") +
            "/" +
            relativeUrl.replace(/^\//, "")
        );
    } else {
        return relativeUrl;
    }
}

/**
 * Make sure proxyUrl is an absolute url
 * When baseUrl tag present, relative url or partial url won't work in Web worker
 * You will get Failed to execute 'open' on 'XMLHttpRequest': Invalid URL Error
 *
 * @returns
 */
function getProxyUrl() {
    const uri =
        previewMapUrl.indexOf("http") === 0
            ? urijs(previewMapUrl)
            : urijs(window.location.href)
                  .search("")
                  .fragment("")
                  .segment([previewMapUrl]);

    return uri.segment("proxy").toString() + "/";
}

export const config: ConfigDataType = {
    ...serverConfig,
    credentialsFetchOptions: credentialsFetchOptions,
    showNotificationBanner: !!serverConfig.showNotificationBanner,
    baseUrl,
    baseExternalUrl,
    uiBaseUrl: serverConfig.uiBaseUrl ? serverConfig.uiBaseUrl : "/",
    authPluginRedirectUrl: serverConfig.authPluginRedirectUrl
        ? serverConfig.authPluginRedirectUrl
        : "/sign-in-redirect",
    contentApiURL,
    searchApiUrl:
        serverConfig.searchApiBaseUrl || fallbackApiHost + "api/v0/search/",
    indexerApiBaseUrl:
        serverConfig?.indexerApiBaseUrl || fallbackApiHost + "api/v0/indexer/",
    registryReadOnlyApiUrl: registryReadOnlyApiUrl,
    registryFullApiUrl: registryFullApiUrl,
    adminApiUrl:
        serverConfig.adminApiBaseUrl || fallbackApiHost + "api/v0/admin/",
    authApiUrl: serverConfig.authApiBaseUrl || fallbackApiHost + "api/v0/auth/",
    correspondenceApiUrl:
        serverConfig.correspondenceApiBaseUrl ||
        fallbackApiHost + "api/v0/correspondence/",
    // before modify the logic of generating storageApiUrl, be sure you've tested the following scenarios:
    // - gateway / backend apis amounted at non-root path (via [global.externalUrl](https://github.com/magda-io/magda/blob/master/deploy/helm/magda-core/README.md))
    // - ui is mounted at non-root path (via web-server.uiBaseUrl)
    // - UI only in cluster deployment
    // - UI only local test server
    storageApiUrl: serverConfig.storageApiBaseUrl
        ? (getFullUrlIfNotEmpty(
              removePathPrefix(serverConfig.storageApiBaseUrl, baseUrl)
          ) as string)
        : fallbackApiHost + "api/v0/storage/",
    previewMapUrl: previewMapUrl,
    proxyUrl: proxyUrl,
    rssUrl: proxyUrl + "_0d/https://blog.data.gov.au/blogs/rss.xml",
    disableAuthenticationFeatures:
        serverConfig.disableAuthenticationFeatures || false,
    breakpoints: {
        small: 768,
        medium: 992,
        large: 1200
    },
    facets: [
        {
            id: "publisher",
            component: Publisher,
            showExplanation: true,
            name: "Organisation"
        },
        { id: "region", component: Region },
        { id: "format", component: Format },
        { id: "temporal", component: Temporal }
    ],
    headerLogoUrl: `${contentApiURL}header/logo`,
    headerMobileLogoUrl: `${contentApiURL}header/logo-mobile`,
    contentUrl: `${contentApiURL}all?id=home/*&id=footer/*&id=config/*&id=header/*&inline=true`,
    fallbackUrl: serverConfig.fallbackUrl,
    months: [
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
        "Oct",
        "Nov",
        "Dec"
    ],
    boundingBox: {
        west: 105,
        south: -45,
        east: 155,
        north: -5
    },
    gapiIds: serverConfig.gapiIds || [],
    featureFlags:
        serverConfig.featureFlags ||
        (process.env.NODE_ENV === "development" ? DEV_FEATURE_FLAGS : {}),
    useMagdaStorageByDefault:
        typeof serverConfig.useMagdaStorageByDefault === "boolean"
            ? serverConfig.useMagdaStorageByDefault
            : true,
    vocabularyApiEndpoints,
    defaultOrganizationId: serverConfig.defaultOrganizationId,
    defaultContactEmail: serverConfig.defaultContactEmail,
    custodianOrgLevel: serverConfig.custodianOrgLevel
        ? serverConfig.custodianOrgLevel
        : 2,
    automaticPreviewMaxFileSize: serverConfig.automaticPreviewMaxFileSize
        ? serverConfig.automaticPreviewMaxFileSize
        : 2097152,
    mandatoryFields: serverConfig.mandatoryFields
        ? serverConfig.mandatoryFields
        : [
              "dataset.title",
              "dataset.description",
              "dataset.defaultLicense",
              "distributions.title",
              "distributions.format",
              "distributions.license",
              "dataset.publisher",
              "publishing.custodianOrgUnitId",
              "licenseLevel",
              "dataset.defaultLicense",
              "informationSecurity.classification",
              "informationSecurity.disseminationLimits",
              "publishToDga"
          ],
    dateConfig: constructDateConfig(serverConfig.dateConfig),
    datasetThemes: serverConfig.datasetThemes ? serverConfig.datasetThemes : [],
    noManualKeywords: serverConfig.noManualKeywords
        ? serverConfig.noManualKeywords
        : false,
    noManualThemes: serverConfig.noManualThemes
        ? serverConfig.noManualThemes
        : false,
    keywordsBlackList: serverConfig.keywordsBlackList
        ? serverConfig.keywordsBlackList
        : [
              "Mr",
              "Ms",
              "Mrs",
              "Miss",
              "Dr",
              "Hon",
              "Jr",
              "Prof",
              "Sr",
              "St",
              "Mr.",
              "Ms.",
              "Mrs.",
              "Miss.",
              "Dr.",
              "Hon.",
              "Jr.",
              "Prof.",
              "Sr.",
              "St."
          ],
    openfaasBaseUrl: serverConfig.openfaasBaseUrl
        ? serverConfig.openfaasBaseUrl
        : baseUrl + "api/v0/openfaas/",
    ckanExportServers,
    defaultCkanServer,
    homePageUrl: serverConfig?.homePageUrl ? serverConfig.homePageUrl : "/",
    anonymousUserLandingPage: serverConfig?.anonymousUserLandingPage
        ? serverConfig.anonymousUserLandingPage
        : "/home",
    authenticatedUserLandingPage: serverConfig?.authenticatedUserLandingPage
        ? serverConfig.authenticatedUserLandingPage
        : "/home",
    authStatusRefreshInterval: serverConfig?.authStatusRefreshInterval
        ? serverConfig.authStatusRefreshInterval
        : 300000
};

export type Config = typeof config;
export type MessageSafeConfig = Omit<Config, "facets">;

export const defaultConfiguration = {
    datasetSearchSuggestionScoreThreshold: 65,
    searchResultsPerPage: 10
};

/** The bucket in the storage API where datasets are stored */
export const DATASETS_BUCKET = serverConfig.defaultDatasetBucket
    ? serverConfig.defaultDatasetBucket
    : "magda-datasets";

export type ConfigType = typeof config;

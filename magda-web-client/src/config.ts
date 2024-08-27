import Publisher from "./Components/Dataset/Search/Facets/Publisher";
import Format from "./Components/Dataset/Search/Facets/Format";
import Region from "./Components/Dataset/Search/Facets/Region";
import Temporal from "./Components/Dataset/Search/Facets/Temporal";
import { ValidationFieldList } from "./Components/Dataset/Add/ValidationManager";
import urijs from "urijs";
import removePathPrefix from "./helpers/removePathPrefix";
import { ADMIN_USERS_ROLE_ID } from "@magda/typescript-common/dist/authorization-api/constants.js";
import AuthDecisionQueryClient from "@magda/typescript-common/dist/opa/AuthDecisionQueryClient.js";
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
 * For default values, please refer to [Magda web-server Helm Chart Doc](https://github.com/magda-io/magda/tree/master/deploy/helm/internal-charts/web-server).
 *
 * @export
 * @interface ConfigDataType
 */
export interface ConfigDataType {
    /**
     * This field allow you to config the common settings of all [fetch requests](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch) sent by the frontend application.
     * One common use case is to set [credentials field](https://developer.mozilla.org/en-US/docs/Web/API/Request/Request#credentials).
     * Its default value is `"credentials": "same-origin"`. When running the web client locally for debugging purpose, you might want to set it to `"credentials": "include"`.
     * This will allow `credentials` (e.g. cookie) to be shared with remote dev testing API server.
     *
     * @type {RequestInit}
     * @memberof ConfigDataType
     */
    commonFetchRequestOptions: RequestInit;

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
     * The authorisation API base URL config value that is supplied by the web server.
     * When this value is not available from the server (e.g. when run web client locally), the default "fallback" API server url will be used to generate this value.
     *
     * @type {string}
     * @memberof ConfigDataType
     */
    authApiBaseUrl: string;

    /**
     * The base URL path of all APIs (e.g. '/');
     * The value of the field might be either from config data retrieved from the server or (when run web client locally) the hardcoded URL to a default "fallback" dev API server url for testing.
     *
     * @type {string}
     * @memberof ConfigDataType
     */
    baseUrl: string;

    /**
     * The default redirection url for all auth plugins once the authentication process is completed.
     *
     * @type {string}
     * @memberof ConfigDataType
     */
    authPluginRedirectUrl: string;

    /**
     * Similar to `baseUrl`. But this field always includes the external access domain of the application.
     * You might want to use its value in use cases e.g. generating external accessible links for email content.
     *
     * @type {string}
     * @memberof ConfigDataType
     */
    baseExternalUrl: string;

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
    uiBaseUrl: string;

    /**
     * Whether or not the notification banner should be shown.
     *
     * @type {boolean}
     * @memberof ConfigDataType
     */
    showNotificationBanner?: boolean;

    /**
     * The content API base URL config value that is supplied by the web server.
     * When this value is not available from the server (e.g. when run web client locally), the default "fallback" API server url will be used to generate this value.
     *
     * @type {string}
     * @memberof ConfigDataType
     */
    contentApiBaseUrl: string;

    /**
     * The API endpoint URL to retrieve all default content items (e.g. header & footer items etc.).
     * The value of this field is created from field `contentApiBaseUrl`.
     * It includes all required query parameters in the URL and serves as a pre-configured short cut to retrieve all default content items for a user.
     *
     * @type {string}
     * @memberof ConfigDataType
     */
    contentUrl: string;

    /**
     * The map preview module base access URL config value that is supplied by the web server.
     * When this value is not available from the server (e.g. when run web client locally), the default "fallback" API server url will be used to generate this value.
     *
     * @type {string}
     * @memberof ConfigDataType
     */
    previewMapBaseUrl: string;

    /**
     * The CORS resource proxy url. Mainly used by map preview module to load CORS resources from whitelist domains.
     * Its value is generated from `previewMapBaseUrl`.
     *
     * @type {string}
     * @memberof ConfigDataType
     */
    proxyUrl: string;

    /**
     * The indexer API base URL config value that is supplied by the web server.
     * When this value is not available from the server (e.g. when run web client locally), the default "fallback" API server url will be used to generate this value.
     *
     * @type {string}
     * @memberof ConfigDataType
     */
    indexerApiBaseUrl: string;

    /**
     * The registry API base URL config value that is supplied by the web server.
     * When this value is not available from the server (e.g. when run web client locally), the default "fallback" API server url will be used to generate this value.
     * Please note: this registry API endpoint can handle both read & write requests.
     * Since v0.0.59, readonly (HTTP GET) requests that are sent to this endpoint externally will be auto-forward to the readonly endpoint `registryApiReadOnlyBaseUrl`.
     * However, for performance consideration (as gateway doesn't need to check HTTP method), `registryApiReadOnlyBaseUrl` should still be the preferred endpoint for readonly requests.
     *
     * @type {string}
     * @memberof ConfigDataType
     */
    registryApiBaseUrl: string;

    /**
     * The registry readonly API base URL config value that is supplied by the web server.
     * When this value is not available from the server (e.g. when run web client locally), the default "fallback" API server url will be used to generate this value.
     * Please note: this registry API endpoint can only handle both read requests only.
     * The readonly registry API endpoint can scale horizontally easily. Thus, should be the preferred endpoint for serving readonly requests.
     *
     * @type {string}
     * @memberof ConfigDataType
     */
    registryApiReadOnlyBaseUrl: string;

    /**
     * The search API base URL config value that is supplied by the web server.
     * When this value is not available from the server (e.g. when run web client locally), the default "fallback" API server url will be used to generate this value.
     *
     * @type {string}
     * @memberof ConfigDataType
     */
    searchApiBaseUrl: string;

    /**
     * The correspondence API base URL config value that is supplied by the web server.
     * When this value is not available from the server (e.g. when run web client locally), the default "fallback" API server url will be used to generate this value.
     *
     * @type {string}
     * @memberof ConfigDataType
     */
    correspondenceApiBaseUrl?: string;

    /**
     * The storage API base URL config value that is supplied by the web server.
     * When this value is not available from the server (e.g. when run web client locally), the default "fallback" API server url will be used to generate this value.
     *
     * @type {string}
     * @memberof ConfigDataType
     */
    storageApiBaseUrl: string;

    /**
     * The admin API base URL config value that is supplied by the web server.
     * When this value is not available from the server (e.g. when run web client locally), the default "fallback" API server url will be used to generate this value.
     *
     * @type {string}
     * @memberof ConfigDataType
     */
    adminApiBaseUrl: string;

    /**
     * Google Analytics ID
     *
     * @type {Array<string>}
     * @memberof ConfigDataType
     */
    gapiIds?: Array<string>;

    /**
     * remote RSS news endpoint.
     * This config field is deprecated & to be removed in future.
     *
     * @type {string}
     * @memberof ConfigDataType
     */
    rssUrl?: string;

    /**
     * When set to `true`, the user account related links & buttons will be removed.
     * Default to `false`.
     *
     * @type {boolean}
     * @memberof ConfigDataType
     */
    disableAuthenticationFeatures: boolean;

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
    featureFlags: FeatureFlagsConfigType;

    /**
     * Whether or not the "use Magda storage" option should be pre-selected on dataset editor UI.
     *
     * @type {boolean}
     * @memberof ConfigDataType
     */
    useMagdaStorageByDefault: boolean;

    /**
     * A list of vocabulary api endpoints that are used to validate the auto-generated keywords in dataset editor UI.
     * By default, it's set to:
     * - "https://vocabs.ands.org.au/repository/api/lda/abares/australian-land-use-and-management-classification/version-8/concept.json",
     * - "https://vocabs.ands.org.au/repository/api/lda/ands-nc/controlled-vocabulary-for-resource-type-genres/version-1-1/concept.json"
     *
     * @type {string[]}
     * @memberof ConfigDataType
     */
    vocabularyApiEndpoints: string[];

    /**
     * A list of keywords that should never be generated by the auto keyword generation module in the dataset editor UI.
     *
     * @type {string[]}
     * @memberof ConfigDataType
     */
    keywordsBlackList?: string[];

    /**
     * Default Organization ID for dataset editor UI.
     *
     * @type {string}
     * @memberof ConfigDataType
     */
    defaultOrganizationId?: string;

    /**
     * Default email to forward users' inquiry.
     *
     * @type {string}
     * @memberof ConfigDataType
     */
    defaultContactEmail?: string;

    /**
     * deprecated. Not used anymore. To be removed in future.
     *
     * @type {number}
     * @memberof ConfigDataType
     */
    custodianOrgLevel: number;

    /**
     * The maximum size that a file can be in order to be automatically previewed by the ui as a map, graph or table.
     *
     * @type {number}
     * @memberof ConfigDataType
     */
    automaticPreviewMaxFileSize: number;

    /**
     * List all mandatory fields in dataset editor.
     *
     * @type {ValidationFieldList}
     * @memberof ConfigDataType
     */
    mandatoryFields: ValidationFieldList;

    /**
     * The date format config used in dataset editor auto date information extraction.
     *
     * @type {DateConfig}
     * @memberof ConfigDataType
     */
    dateConfig: DateConfig;

    /**
     * Whether or not allow user to input manual keywords in the dataset editor.
     *
     * @type {boolean}
     * @memberof ConfigDataType
     */
    noManualKeywords?: boolean;

    /**
     * Whether or not allow user to input manual themes in the dataset editor.
     *
     * @type {boolean}
     * @memberof ConfigDataType
     */
    noManualThemes?: boolean;

    /**
     * Predefined dataset theme list used in the dataset editor.
     *
     * @type {boolean}
     * @memberof ConfigDataType
     */
    datasetThemes?: string[];

    /**
     * The openfaas API base URL config value that is supplied by the web server.
     * When this value is not available from the server (e.g. when run web client locally), the default "fallback" API server url will be used to generate this value.
     *
     * @type {string}
     * @memberof ConfigDataType
     */
    openfaasBaseUrl?: string;

    /**
     * Config for optional dataset auto-sync to ckan feature.
     * Only available when [magda-minion-ckan-exporter](https://github.com/magda-io/magda-minion-ckan-exporter) is deployed and feature flag `publishToDga` is `true`.
     * This feature is still in beta.
     *
     * @type {{
     *         [ckanServerUrl: string]: boolean;
     *     }}
     * @memberof ConfigDataType
     */
    ckanExportServers: {
        [ckanServerUrl: string]: boolean;
    };

    /**
     * The default CKAN server for the optional dataset auto-sync to ckan feature.
     * see config field `ckanExportServers`.
     *
     * @type {string}
     * @memberof ConfigDataType
     */
    defaultCkanServer: string;

    /**
     * The default timezone used in the application.
     *
     * @type {string}
     * @memberof ConfigDataType
     */
    defaultTimeZone?: string;

    /**
     * Indicate whether or not the crawler web view is enabled on [Magda web-server](https://github.com/magda-io/magda/tree/master/deploy/helm/internal-charts/web-server) to provide search engine optimized views.
     *
     * @type {boolean}
     * @memberof ConfigDataType
     */
    enableCrawlerViews?: boolean;

    /**
     * The discourse site url.
     * For the optional discourse site integration feature.
     * When its value is empty, the feature will be disabled.
     *
     * @type {string}
     * @memberof ConfigDataType
     */
    discourseSiteUrl?: string;

    /**
     * For the optional discourse site integration feature.
     * Indicate whether show the discourse comment area on dataset page.
     *
     * @type {boolean}
     * @memberof ConfigDataType
     */
    discourseIntegrationDatasetPage?: boolean;

    /**
     * For the optional discourse site integration feature.
     * Indicate whether show the discourse comment area on distribution page.
     *
     * @type {boolean}
     * @memberof ConfigDataType
     */
    discourseIntegrationDistributionPage?: boolean;

    /**
     * A list of optional external UI component plugins bundle URLs.
     *
     * @type {string[]}
     * @memberof ConfigDataType
     */
    externalUIComponents?: string[];

    /**
     * A list of optional external CSS files to overwrite the looking of the site.
     *
     * @type {string[]}
     * @memberof ConfigDataType
     */
    externalCssFiles?: string[];

    /**
     * The url used when user click `home` link or header logo.
     * Default to "/"
     *
     * @type {string}
     * @memberof ConfigDataType
     */
    homePageUrl?: string;

    /**
     * The responsive UI break points.
     *
     * @type {{
     *         small: number;
     *         medium: number;
     *         large: number;
     *     }}
     * @memberof ConfigDataType
     */
    breakpoints?: {
        small: number;
        medium: number;
        large: number;
    };

    /**
     * Search panel facet config.
     *
     * @type {FacetConfigItem[]}
     * @memberof ConfigDataType
     */
    facets?: FacetConfigItem[];

    /**
     * Header logo URL.
     *
     * @type {string}
     * @memberof ConfigDataType
     */
    headerLogoUrl?: string;

    /**
     * Header logo URL for mobile view.
     *
     * @type {string}
     * @memberof ConfigDataType
     */
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
    boundingBox: {
        west: number;
        south: number;
        east: number;
        north: number;
    };

    /**
     * Whether the "Open in XXXX" button over the map preview module should support terria map v7 config format.
     *
     * @type {boolean}
     * @memberof ConfigDataType
     */
    supportExternalTerriaMapV7?: boolean;

    /**
     * The the "Open in XXXX" over the map preview module button text label.
     * By default, it's set to "Open in National Map".
     * But you can set to other value in case you want to send data to your own terria map.
     *
     * @type {string}
     * @memberof ConfigDataType
     */
    openInExternalTerriaMapButtonText?: string;

    /**
     * The target terria map URL that the "Open in XXXX" over the map preview module button should send data to.
     *
     * @type {string}
     * @memberof ConfigDataType
     */
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

    /**
     * A format preference list for the map preview module.
     * It controls, on dataset page, when more than one formats are available, which format data file / API will be used for best user experience.
     *
     * @type {RawPreviewMapFormatPerferenceItem[]}
     * @memberof ConfigDataType
     */
    previewMapFormatPerference?: RawPreviewMapFormatPerferenceItem[];

    /**
     * Whether or not show the contact button when the contact information of the dataset is not available.
     * When set to `true`, the inquiries will be sent to the default contact email.
     *
     * @type {boolean}
     * @memberof ConfigDataType
     */
    showContactButtonForNoContactPointDataset?: boolean;

    /**
     * The default storage bucket that storage API should use.
     *
     * @type {string}
     * @memberof ConfigDataType
     */
    defaultDatasetBucket?: string;

    /**
     * The landing page URL for anonymous users.
     * By default, it's "/home". You might want to set to "/account", if your system is not open to public users.
     *
     * @type {string}
     * @memberof ConfigDataType
     */
    anonymousUserLandingPage: string;

    /**
     * The landing page URL for authenticated users.
     * By default, it's "/home".
     *
     * @type {string}
     * @memberof ConfigDataType
     */
    authenticatedUserLandingPage: string;

    /**
     * How long before reload the current user's auth data in the background.
     * Useful to transit UI to correct status when user leave browser open without interaction for long time.
     * Default: 5 mins
     *
     * @type {number}
     * @memberof ConfigDataType
     */
    authStatusRefreshInterval?: number;

    /**
     * The extension ID of the web-llm service worker chrome extension plugin.
     * Only required by organisation-managed devices (e.g. company laptops).
     * See here for more details: https://github.com/magda-io/magda-llm-service-worker-extension
     *
     * @type {string}
     * @memberof ConfigDataType
     */
    llmExtensionId: string;
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

const previewMapBaseUrl =
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
export const commonFetchRequestOptions: RequestInit = !isBackendSameOrigin
    ? {
          credentials: "include"
      }
    : {
          credentials: "same-origin"
      };

AuthDecisionQueryClient.fetchOptions = { ...commonFetchRequestOptions };

const contentApiBaseUrl =
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
        previewMapBaseUrl.indexOf("http") === 0
            ? urijs(previewMapBaseUrl)
            : urijs(window.location.href)
                  .search("")
                  .fragment("")
                  .segment([previewMapBaseUrl]);

    return uri.segment("proxy").toString() + "/";
}

export const config: ConfigDataType = {
    ...serverConfig,
    commonFetchRequestOptions: commonFetchRequestOptions,
    showNotificationBanner: !!serverConfig.showNotificationBanner,
    baseUrl,
    baseExternalUrl,
    uiBaseUrl: serverConfig.uiBaseUrl ? serverConfig.uiBaseUrl : "/",
    authPluginRedirectUrl: serverConfig.authPluginRedirectUrl
        ? serverConfig.authPluginRedirectUrl
        : "/sign-in-redirect",
    contentApiBaseUrl,
    searchApiBaseUrl:
        serverConfig.searchApiBaseUrl || fallbackApiHost + "api/v0/search/",
    indexerApiBaseUrl:
        serverConfig?.indexerApiBaseUrl || fallbackApiHost + "api/v0/indexer/",
    registryApiReadOnlyBaseUrl:
        serverConfig.registryApiReadOnlyBaseUrl ||
        fallbackApiHost + "api/v0/registry-read-only/",
    registryApiBaseUrl:
        serverConfig.registryApiBaseUrl || fallbackApiHost + "api/v0/registry/",
    adminApiBaseUrl:
        serverConfig.adminApiBaseUrl || fallbackApiHost + "api/v0/admin/",
    authApiBaseUrl:
        serverConfig.authApiBaseUrl || fallbackApiHost + "api/v0/auth/",
    correspondenceApiBaseUrl:
        serverConfig.correspondenceApiBaseUrl ||
        fallbackApiHost + "api/v0/correspondence/",
    // before modify the logic of generating storageApiUrl, be sure you've tested the following scenarios:
    // - gateway / backend apis amounted at non-root path (via [global.externalUrl](https://github.com/magda-io/magda/blob/master/deploy/helm/magda-core/README.md))
    // - ui is mounted at non-root path (via web-server.uiBaseUrl)
    // - UI only in cluster deployment
    // - UI only local test server
    storageApiBaseUrl: serverConfig.storageApiBaseUrl
        ? (getFullUrlIfNotEmpty(
              removePathPrefix(serverConfig.storageApiBaseUrl, baseUrl)
          ) as string)
        : fallbackApiHost + "api/v0/storage/",
    previewMapBaseUrl,
    proxyUrl,
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
    headerLogoUrl: `${contentApiBaseUrl}header/logo`,
    headerMobileLogoUrl: `${contentApiBaseUrl}header/logo-mobile`,
    contentUrl: `${contentApiBaseUrl}all?id=home/*&id=footer/*&id=config/*&id=header/*&inline=true`,
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
              "dataset.constraintExemption",
              "publishing.custodianOrgUnitId",
              "publishing.level",
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
        : 300000,
    llmExtensionId: serverConfig?.llmExtensionId
        ? serverConfig.llmExtensionId
        : // this is the ID of the default extension allow access from domain magda.io
          "ljadmjdilnpmlhopijgimonfackfngmi"
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

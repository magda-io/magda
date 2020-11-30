import Publisher from "./Components/Dataset/Search/Facets/Publisher";
import Format from "./Components/Dataset/Search/Facets/Format";
import Region from "./Components/Dataset/Search/Facets/Region";
import Temporal from "./Components/Dataset/Search/Facets/Temporal";
import { ValidationFieldList } from "./Components/Dataset/Add/ValidationManager";
import urijs from "urijs";
import removePathPrefix from "helpers/removePathPrefix";

export const ADMIN_ROLE_ID = "00000000-0000-0003-0000-000000000000";

declare global {
    interface Window {
        magda_client_homepage_config: any;
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

const DEV_FEATURE_FLAGS = {
    cataloguing: true,
    publishToDga: true,
    previewAddDataset: false,
    placeholderWorkflowsOn: false,
    datasetApprovalWorkflowOn: false,
    useStorageApi: true
};

interface DateConfig {
    dateFormats: string[];
    dateRegexes: {
        dateRegex: RegExp;
        startDateRegex: RegExp;
        endDateRegex: RegExp;
    };
}

const serverConfig: {
    authApiBaseUrl?: string;
    baseUrl?: string;
    authPluginRedirectUrl?: string;
    baseExternalUrl?: string;
    uiBaseUrl?: string;
    showNotificationBanner?: boolean;
    contentApiBaseUrl?: string;
    previewMapBaseUrl?: string;
    registryApiBaseUrl?: string;
    registryApiReadOnlyBaseUrl?: string;
    searchApiBaseUrl?: string;
    correspondenceApiBaseUrl?: string;
    storageApiBaseUrl?: string;
    gapiIds?: Array<string>;
    adminApiBaseUrl?: string;
    disableAuthenticationFeatures?: boolean;
    fallbackUrl?: string;
    featureFlags?: {
        [id: string]: boolean;
    };
    vocabularyApiEndpoints: string[];
    defaultOrganizationId?: string;
    defaultContactEmail?: string;
    custodianOrgLevel: number;
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
    defultCkanServer: string;
} = window.magda_server_config || {};

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
    var dateConfig: DateConfig = {
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
const credentialsFetchOptions: RequestInit = !isBackendSameOrigin
    ? {
          credentials: "include"
      }
    : {
          credentials: "same-origin"
      };

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

export const config = {
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
    vocabularyApiEndpoints,
    defaultOrganizationId: serverConfig.defaultOrganizationId,
    defaultContactEmail: serverConfig.defaultContactEmail,
    custodianOrgLevel: serverConfig.custodianOrgLevel
        ? serverConfig.custodianOrgLevel
        : 2,
    // The maximum size that a file can be in order to be automatically previewed
    // by the ui as a map, graph or table.
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
    defaultCkanServer
};

export type Config = typeof config;
export type MessageSafeConfig = Omit<Config, "facets">;

export const defaultConfiguration = {
    datasetSearchSuggestionScoreThreshold: 65,
    searchResultsPerPage: 10
};

/** The bucket in the storage API where datasets are stored */
export const DATASETS_BUCKET = "magda-datasets";

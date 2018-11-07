// @flow
import Publisher from "./Components/SearchFacets/Publisher";
import Format from "./Components/SearchFacets/Format";
import Region from "./Components/SearchFacets/Region";
import Temporal from "./Components/SearchFacets/Temporal";

// Local minikube/docker k8s cluster
// const fallbackApiHost = "http://localhost:30100/";
// Dev server
const fallbackApiHost = "https://dev.magda.io/";

const homePageConfig: {
    baseUrl: string,
    backgroundImageUrls: Array<string>
} =
    window.magda_client_homepage_config || {};

const serverConfig: {
    authApiBaseUrl?: string,
    baseUrl?: string,
    contentApiBaseUrl?: string,
    previewMapBaseUrl?: string,
    registryApiBaseUrl?: string,
    searchApiBaseUrl?: string,
    correspondenceApiBaseUrl?: string,
    gapiIds?: Array<string>
} =
    window.magda_server_config || {};

const registryApiUrl =
    serverConfig.registryApiBaseUrl || fallbackApiHost + "api/v0/registry/";

const previewMapUrl =
    serverConfig.previewMapBaseUrl || fallbackApiHost + "preview-map/";
const proxyUrl = previewMapUrl + "proxy/";
const baseUrl = serverConfig.baseUrl || fallbackApiHost;
const baseExternalUrl =
    baseUrl === "/"
        ? window.location.protocol + "//" + window.location.host + "/"
        : baseUrl;

const fetchOptions =
    `${window.location.protocol}//${window.location.host}/` !== baseUrl
        ? {
              credentials: "include"
          }
        : {
              credentials: "same-origin"
          };

const contentApiURL =
    serverConfig.contentApiBaseUrl || fallbackApiHost + "api/v0/content/";

export const config = {
    fetchOptions,
    homePageConfig: homePageConfig,
    baseUrl,
    baseExternalUrl,
    contentApiURL,
    searchApiUrl:
        serverConfig.searchApiBaseUrl || fallbackApiHost + "api/v0/search/",
    registryApiUrl: registryApiUrl,
    adminApiUrl:
        serverConfig.adminApiBaseUrl || fallbackApiHost + "api/v0/admin/",
    authApiUrl: serverConfig.authApiBaseUrl || fallbackApiHost + "api/v0/auth/",
    correspondenceApiUrl:
        serverConfig.correspondenceApiBaseUrl ||
        fallbackApiHost + "api/v0/correspondence/",
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
        { id: "temporal", component: Temporal },
        { id: "format", component: Format }
    ],
    headerLogoUrl: `${contentApiURL}header/logo.bin`,
    headerMobileLogoUrl: `${contentApiURL}header/logo-mobile.bin`,
    contentUrl: `${contentApiURL}all?id=*/navigation/*&id=home/*&id=footer/*&id=configuration/*&inline=true`,
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
    gapiIds: serverConfig.gapiIds || []
};

export const defaultConfiguration = {
    datasetSearchSuggestionScoreThreshold: 65,
    searchResultsPerPage: 10
};

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
    discussionsApiBaseUrl?: string,
    previewMapBaseUrl?: string,
    registryApiBaseUrl?: string,
    searchApiBaseUrl?: string,
    feedbackApiBaseUrl?: string,
    correspondenceApiBaseUrl?: string
} =
    window.magda_server_config || {};
//this below const enables suggest/request/report dataset forms when enabled
export const enableSuggestDatasetPage = true;

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

export const config = {
    homePageConfig: homePageConfig,
    appName: "data.gov.au",
    about:
        "<p><span style='color:#4C2A85;'>Data.gov.au</span> provides an easy way to find, access and reuse public data.</p><p> Our team works across governments to publish data and continue to improve functionality based on user feedback.</p>",
    baseUrl,
    baseExternalUrl,
    searchApiUrl:
        serverConfig.searchApiBaseUrl || fallbackApiHost + "api/v0/search/",
    registryApiUrl: registryApiUrl,
    adminApiUrl:
        serverConfig.adminApiBaseUrl || fallbackApiHost + "api/v0/admin/",
    authApiUrl: serverConfig.authApiBaseUrl || fallbackApiHost + "api/v0/auth/",
    correspondenceApiUrl:
        serverConfig.correspondenceApiBaseUrl ||
        fallbackApiHost + "api/v0/correspondence/",
    discussionsApiUrl:
        serverConfig.discussionsApiBaseUrl ||
        fallbackApiHost + "api/v0/discussions/",
    feedbackUrl:
        serverConfig.feedbackApiBaseUrl ||
        fallbackApiHost + "api/v0/feedback/user",
    previewMapUrl: previewMapUrl,
    proxyUrl: proxyUrl,
    rssUrl: proxyUrl + "_0d/https://blog.data.gov.au/blogs/rss.xml",
    resultsPerPage: 10,
    disableAuthenticationFeatures:
        serverConfig.disableAuthenticationFeatures || false,
    breakpoints: {
        small: 768,
        medium: 992,
        large: 1200
    },
    appTitle: "Australian open data search",
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
    headerNavigation: [
        ["Datasets", "search"],
        ["Organisations", "organisations"],
        ["Community", "https://community.digital.gov.au/c/open-data"],
        ["About", "page/about"],
        ...(serverConfig.disableAuthenticationFeatures ? [] : [])
    ],
    footerNavigation: {
        // small media query (mobile)
        small: [
            {
                category: "Data.gov.au",
                links: [
                    ["About", "page/about"],
                    [
                        "Suggest a dataset",
                        !enableSuggestDatasetPage
                            ? "mailto:data@digital.gov.au"
                            : "suggest"
                    ],
                    ["Sign in", "https://data.gov.au/user/login"],
                    ["Give feedback", "feedback"]
                ]
            }
        ],
        // medium media query and bigger (desktop)
        medium: [
            {
                category: "Data.gov.au",
                links: [
                    ["About", "page/about"],
                    [
                        "Suggest a dataset",
                        !enableSuggestDatasetPage
                            ? "mailto:data@digital.gov.au"
                            : "suggest"
                    ],
                    ["Privacy Policy", "page/privacy-policy"],
                    ["Give feedback", "feedback"]
                ]
            },
            {
                category: "Publishers",
                links: [
                    ["Sign in", "https://data.gov.au/user/login"],
                    ["Open data toolkit", "https://toolkit.data.gov.au/"]
                ]
            },
            {
                category: "Developers",
                links: [
                    ["Powered by Magda", "https://github.com/TerriaJS/magda/"]
                ]
            }
        ]
    },
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
    fallbackUrl: serverConfig.fallbackUrl
};

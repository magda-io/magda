// @flow
import Publisher from "./Components/SearchFacets/Publisher";
import Format from "./Components/SearchFacets/Format";
import Region from "./Components/SearchFacets/Region";
import Temporal from "./Components/SearchFacets/Temporal";

const fallbackApiHost = "http://magda-dev.terria.io/";

const serverConfig = window.magda_server_config || {};

const registryApiUrl =
  serverConfig.registryApiBaseUrl || fallbackApiHost + "api/v0/registry/";
const previewMapUrl = serverConfig.previewMapBaseUrl || fallbackApiHost + "preview-map/";
const proxyUrl = previewMapUrl + "proxy/";

export const config = {
  appName: "data.gov.au",
  about: "<p><span style='color:#F55860;'>Data.gov.au</span> provides an easy way to find, access and reuse public data.</p><p> Our team works across governments to publish data and continue to improve functionality based on user feedback.</p>",
  baseUrl: serverConfig.baseUrl || fallbackApiHost,
  searchApiUrl:
    serverConfig.searchApiBaseUrl || fallbackApiHost + "api/v0/search/",
  registryApiUrl: registryApiUrl,
  adminApiUrl: serverConfig.adminApiBaseUrl || fallbackApiHost + "api/v0/admin/",
  authApiUrl: serverConfig.authApiBaseUrl || fallbackApiHost + "api/v0/auth/",
  discussionsApiUrl:
    serverConfig.discussionsApiBaseUrl ||
    fallbackApiHost + "api/v0/discussions/",
  previewMapUrl: previewMapUrl,
  proxyUrl: proxyUrl,
  rssUrl: proxyUrl + "_0d/https://blog.data.gov.au/blogs/rss.xml",
  facetListSize: 5,
  resultsPerPage: 10,
  descriptionLength: 50,
  downloadLinksSize: 3,
  disableAuthenticationFeatures:
    serverConfig.disableAuthenticationFeatures || false,
  breakpoints: {
    small: 768,
    medium: 992,
    large: 1200
  },
  appTitle: 'Australian open data search',
  featuredDatasets: [
    "ds-dga-19432f89-dc3a-4ef3-b943-5326ef1dbecc",
    "ds-dga-bdcf5b09-89bc-47ec-9281-6b8e9ee147aa"
  ],
  exampleSearch: [
    "Business names as CSV",
    "Geocoded National Address File",
    "By Australian Charities and Not-for-profits Commission",
    "Statistics from 2013 by Australian Taxation Office",
    "Trees in SA2:201011002",
    "Budget from 2016 to 2017 by Department of Finance",
    "Planning as WMS"
  ],
  suggestion: [
    "Business names as CSV",
    "Statistics  by Australian Taxation Office from 2013",
    "Trees in SA2:201011002"
  ],
  facets: [
    { id: "publisher", component: Publisher },
    { id: "region", component: Region },
    { id: "temporal", component: Temporal },
    { id: "format", component: Format }
  ],
  headerNavigation: [
    ["About", "page/about"],
    ["Publishers", "publishers"],
    ...(serverConfig.disableAuthenticationFeatures
      ? []
      : [["Projects", "projects"]])
  ],
  footerNavigation: [
    {
      category: "Search",
      links: [
        ["Data sources", "page/data-sources"],
      ]
    },
    {
      category: "Publishers",
      links: [
        ["Publisher index", "publishers"],
        ["Open data toolkit", "https://toolkit.data.gov.au/"]
      ]
    },
    {
      category: "Developers",
      links: [
        ["API Docs", "http://search.data.gov.au/api/v0/registry/swagger/index.html"]
      ]
    },
    {
      category: "About",
      links: [
        ["About data.gov.au", "page/about"],
        ["Blog", "https://blog.data.gov.au/"]
      ]
    },
    { category: "Feedback", links: [["Feedback", "http://preview.data.gov.au/feedback.html"]] }
  ]
};

// @flow
import Publisher from "./SearchFacets/Publisher";
import Format from "./SearchFacets/Format";
import Region from "./SearchFacets/Region";
import Temporal from "./SearchFacets/Temporal";

const fallbackApiHost = "http://search.data.gov.au/";
// const apiHost = 'http://minikube.data.gov.au:30016/';
// const apiHost = 'http://localhost:3016/';

const serverConfig = window.magda_server_config || {};

const registryUrl =
  serverConfig.registryApiBaseUrl || fallbackApiHost + "api/v0/registry";

export const config = {
  appName: "data.gov.au",
  apiHost: serverConfig.authApiBaseUrl || fallbackApiHost,
  searchApiBaseUrl:
    serverConfig.searchApiBaseUrl || fallbackApiHost + "api/v0/search",
  registryUrl: registryUrl,
  authApiUrl: serverConfig.authApiBaseUrl || fallbackApiHost + "api/v0/auth",
  discussionsApiUrl:
    serverConfig.discussionsApiBaseUrl ||
    fallbackApiHost + "api/v0/discussions",
  rssUrl:
    "https://nationalmap.gov.au/proxy/_0d/https://blog.data.gov.au/blogs/rss.xml",
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
    "not react-document-title",
    "0ff854cc-a621-4929-89d3-f0370c3dd344"
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
    ["Search", "search"],
    ...(serverConfig.disableAuthenticationFeatures
      ? []
      : [["Projects", "projects"]]),
    ["Publishers", "publishers"],
    ["About", "page/about"]
  ],
  footerNavigation: [
    {
      category: "Search",
      links: [
        ["Data sources", "page/data-sources"],
        ["Search syntax", "page/search-syntax"]
      ]
    },
    ...(serverConfig.disableAuthenticationFeatures
      ? []
      : [
          {
            category: "Projects",
            links: [
              ["Browse projects", "projects"],
              ["Start a project", "project/new"]
            ]
          }
        ]),
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
        ["Architecture", "page/architecture"],
        ["API Docs", registryUrl + "/swagger/index.html"]
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

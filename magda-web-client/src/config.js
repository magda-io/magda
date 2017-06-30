// @flow
import Publisher from './SearchFacets/Publisher';
import Format from './SearchFacets/Format';
import Region from './SearchFacets/Region';
import Temporal from './SearchFacets/Temporal';

const apiHost = 'http://magda-api-dev.terria.io/';
// const apiHost = 'http://minikube.data.gov.au:30016/';
// const apiHost = 'http://localhost:3016/';

const serverConfig = window.magda_server_config || {};

const registryUrl = serverConfig.registryApiBaseUrl || (apiHost + 'api/v0/registry');

export const config = {
        appName: 'data.gov.au',
        apiHost,
        searchApiBaseUrl: serverConfig.searchApiBaseUrl || (apiHost + 'api/v0/search'),
        registryUrl: registryUrl,
        authApiUrl: serverConfig.authApiBaseUrl || (apiHost + 'api/v0/auth'),
        discussionsApiUrl: serverConfig.discussionsApiBaseUrl || (apiHost + 'api/v0/discussions'),
        rssUrl: 'https://nationalmap.gov.au/proxy/_0d/https://blog.data.gov.au/blogs/rss.xml',
        facetListSize: 5,
        resultsPerPage: 10,
        descriptionLength: 50,
        downloadLinksSize: 3,
        disableAuthenticationFeatures: serverConfig.disableAuthenticationFeatures || false,
        breakpoints: {
          small: 768,
          medium: 992,
          large: 1200
        },
        featuredDatasets: ['19432f89-dc3a-4ef3-b943-5326ef1dbecc', 'bdcf5b09-89bc-47ec-9281-6b8e9ee147aa'],
        exampleSearch: [
          'Business Names by ASIC as CSV',
          'Geocoded National Address File',
          'By Australian Charities and Not-for-profits Commission',
          'Taxation Statistics from 2013',
          'Trees in Victoria',
          'Budget from 2016 to 2017 by Department of Finance',
          'Planning as WMS'
        ],
        suggestion: ['Business names by ASIC as CSV','Taxation Statistics from 2013', 'Trees in Victoria'],
        facets: [{id: 'publisher', component: Publisher},
                 {id: 'region', component: Region},
                 {id: 'temporal', component: Temporal},
                 {id: 'format', component: Format}
               ],
        headerNavigation: [
            ['Search', 'search'],
            ...(serverConfig.disableAuthenticationFeatures ? [] : [['Projects', 'projects']]),
            ['Publishers', 'publishers'],
            ['About', 'page/about']
        ],
        footerNavigation: [
            {category: 'Search', links: [['Data sources', 'page/data-sources'], ['Search syntax', 'page/search-syntax']]},
            ...(serverConfig.disableAuthenticationFeatures ? [] : [{category: 'Projects', links: [['Browse projects', 'projects'], ['Start a project', 'project/new']]}]),
            {category: 'Publishers', links: [['Publisher index', 'publishers'], ['Open data toolkit', 'https://toolkit.data.gov.au/']]},
            {category: 'Developers', links: [['Architecture', 'page/architecture'], ['API Docs', registryUrl + '/swagger/index.html']]},
            {category: 'About', links: [['About data.gov.au', 'page/about'], ['Blog', 'https://blog.data.gov.au/']]},
            {category: 'Feedback', links: [['Feedback', 'feedback']]}]
        }

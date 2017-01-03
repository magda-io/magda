import Publisher from './SearchFacets/Publisher';
import Format from './SearchFacets/Format';
import Region from './SearchFacets/Region';
import Temporal from './SearchFacets/Temporal';


const config = {
        searchApiBaseUrl: 'http://magda-search-api.terria.io/',
        facetListSize: 5,
        resultsPerPage: 10,
        descriptionLength: 50,
        downloadLinksSize: 3,
        exampleSearch: [
          'mobile black spot',
          'taxation from 2014 to 2016',
          'water in Melbourne',
          'health as CSV',
          'advisers by Australian securities'
        ],
        facets: [{id: 'publisher', component: Publisher},
                 {id: 'region', component: Region},
                 {id: 'temporal', component: Temporal},
                 {id: 'format', component: Format}
               ]
        }

 export{config}

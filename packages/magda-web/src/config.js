import Publisher from './SearchFacets/Publisher';
import Format from './SearchFacets/Format';
import Region from './SearchFacets/Region';
import Temporal from './SearchFacets/Temporal';


export default function() {
    return {
        searchApiBaseUrl: 'http://magda-search-api.terria.io/',
        facetListSize: 5,
        resultsPerPage: 10,
        descriptionLength: 50,
        downloadLinksSize: 3,
        facets: [{id: 'publisher', component: Publisher},
                 {id: 'region', component: Region},
                 {id: 'temporal', component: Temporal},
                 {id: 'format', component: Format}
               ]
             }
           }

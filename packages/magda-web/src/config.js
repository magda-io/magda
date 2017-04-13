import Publisher from './SearchFacets/Publisher';
import Format from './SearchFacets/Format';
import Region from './SearchFacets/Region';
import Temporal from './SearchFacets/Temporal';

const config = {
        searchApiBaseUrl: 'http://magda-search-api-dev.terria.io/',
        facetListSize: 5,
        resultsPerPage: 10,
        descriptionLength: 50,
        downloadLinksSize: 3,
        exampleSearch: [
          'Business Names by ASIC as CSV',
          'Geocoded National Address File',
          'By Australian Charities and Not-for-profits Commission',
          'Taxation Statistics from 2013',
          'Trees in Victoria',
          'Budget from 2016 to 2017 by Department of Finance',
          'Planning as WMS'
        ],
        facets: [{id: 'publisher', component: Publisher},
                 {id: 'region', component: Region},
                 {id: 'temporal', component: Temporal},
                 {id: 'format', component: Format}
               ],
        headerNavigation: [["Search", "search"], ["Projects", "projects"], ["Publishers", "publishers"], ["About", "about"]],
        footerNavigation: [{category: "Search", links: [["Search syntax", "search-syntax"], ["Data sources", "data-source"], ["Publishers", "publisher"]]},
                    {category: "Projects", links: [["Browse projects", "browse-projects"], ["start a projects", "start-a-projects"]]},
                    {category: "Publishers", links: [["Publisher index", "publisher-index"], ["Open data toolkit", "open-data-toolkit"]]},
                    {category: "Developers", links: [["Archetecture", "archetecture"], ["API doc", "api-doc"]]},
                    {category: "About", links: [["About data.gov.au", "about"], ["Contact us", "contact"], ["Blog", "blog"]]},
                    {category: "Feedback", links: [["How can we imporve data.gov.au", "feedback"]]}]
        }

 export{config}

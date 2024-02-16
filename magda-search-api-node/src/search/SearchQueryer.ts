import { Query, FacetType, SearchResult, FacetSearchResult } from "../model.js";

/**
 * Performs searches for datasets.
 */
export default interface SearchQueryer {
    /**
     * Searches within a facet (e.g. "publishers")
     *
     * @param facetType The type of facet to search
     * @param generalQuery The query that will be used for datasets, in order to
     *      determine what the hit count for each facet search result will be
     * @param start Where to start showing results from
     * @param limit How many results to show
     * @param facetQuery The query to use for the facets themselves
     */
    searchFacets(
        facetType: FacetType,
        generalQuery: Query,
        start: number,
        limit: number,
        facetQuery: string | undefined
    ): Promise<FacetSearchResult>;

    /**
     * Search for a result
     *
     * @param query The query to search for
     * @param start Where to start results from
     * @param limit How many results to return
     * @param facetSize How many results to return for facets
     */
    search(
        query: Query,
        start: number,
        limit: number,
        facetSize: number
    ): Promise<SearchResult>;
}

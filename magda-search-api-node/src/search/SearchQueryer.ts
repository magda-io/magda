import { Query, FacetType, SearchResult, FacetSearchResult } from "../model";

export default interface SearchQueryer {
    searchFacets(
        facetType: FacetType,
        generalQuery: Query,
        start: number,
        limit: number,
        facetQuery: string | undefined
    ): Promise<FacetSearchResult>;

    search(
        query: Query,
        start: number,
        limit: number,
        facetSize: number
    ): Promise<SearchResult>;
}

import { Query, FacetType, FacetSearchResult } from "../model";

export default interface SearchQueryer {
    searchFacets(
        facetType: FacetType,
        generalQuery: Query,
        start: number,
        limit: number,
        facetQuery: string | undefined
    ): Promise<FacetSearchResult>;
}

import { FacetType, Query } from "../../model";

export interface FacetDefinition {
    facetType: FacetType;
    exactMatchQuery(term: string): any;
    removeFromQuery(query: Query): Query;
}

export default function getFacetDefinition(facetType: FacetType) {
    if (facetType === "publisher") {
        return {
            exactMatchQuery: (term: string) => ({
                match: {
                    "publisher.name.keyword_lowercase": term
                }
            }),
            removeFromQuery: (query: Query) =>
                ({
                    ...query,
                    publishers: []
                } as Query)
        };
    }
    throw new Error("Unknown facet type " + facetType);
}

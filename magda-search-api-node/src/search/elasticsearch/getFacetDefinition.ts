import { FacetType, Query } from "../../model.js";

/**
 * Facet-specific details for a certain facet (e.g. publisher, format)
 */
export interface FacetDefinition {
    /** What kind of facet this is */
    facetType: FacetType;
    /**
     * An elasticsearch filter that will match only dataset documents that
     * have the term specified for this facet.
     */
    exactMatchQuery(term: string): any;
    /**
     * Builds a new query object without any query for this facet. Does not
     * modify the passed in object.
     */
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

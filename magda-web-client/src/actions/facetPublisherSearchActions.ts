import { actionTypes } from "../constants/ActionTypes";
import { FacetAction, FacetSearchJson } from "../helpers/datasetSearch";
import { FetchError } from "../types";
import { autocompletePublishers } from "api-clients/SearchApis";
import { Query as SearchQuery } from "../helpers/buildSearchQueryString";

export function requestPublishers(facetQuery): FacetAction {
    return {
        type: actionTypes.FACET_REQUEST_PUBLISHERS,
        facetQuery
    };
}

export function requestPublishersFailed(
    facetQuery,
    error: FetchError
): FacetAction {
    return {
        type: actionTypes.FACET_REQUEST_PUBLISHERS_FAILED,
        error,
        facetQuery
    };
}

export function receivePublishers(facetQuery: string, json: any): FacetAction {
    return {
        type: actionTypes.FACET_RECEIVE_PUBLISHERS,
        json: json,
        facetQuery
    };
}

export function resetPublisherSearch(): FacetAction {
    return {
        type: actionTypes.FACET_RESET_PUBLISHERS
    };
}

export function fetchPublisherSearchResults(
    generalQuery: SearchQuery,
    facetQuery: string
) {
    return (dispatch: (action: FacetAction) => void) => {
        if (facetQuery && facetQuery.length > 0) {
            dispatch(requestPublishers(facetQuery));

            autocompletePublishers(generalQuery, facetQuery)
                .then((json: FacetSearchJson) => {
                    return dispatch(receivePublishers(facetQuery, json));
                })
                .catch(error =>
                    dispatch(
                        requestPublishersFailed(facetQuery, {
                            title: error.name,
                            detail: error.message
                        })
                    )
                );
        } else {
            return dispatch(resetPublisherSearch());
        }
    };
}

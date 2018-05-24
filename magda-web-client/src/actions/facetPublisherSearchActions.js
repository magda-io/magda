// @flow

import fetch from "isomorphic-fetch";
import { config } from "../config";
import { actionTypes } from "../constants/ActionTypes";
import type { FacetAction, FacetSearchJson } from "../helpers/datasetSearch";
import type { FetchError } from "../types";

export function requestPublishers(
    generalQuery: string,
    facetQuery
): FacetAction {
    return {
        type: actionTypes.FACET_REQUEST_PUBLISHERS,
        generalQuery,
        facetQuery
    };
}

export function requestPublishersFailed(error: FetchError): FacetAction {
    return {
        type: actionTypes.FACET_REQUEST_PUBLISHERS_FAILED,
        error
    };
}

export function receivePublishers(
    generalQuery: string,
    facetQuery: string,
    json: Object
): FacetAction {
    return {
        type: actionTypes.FACET_RECEIVE_PUBLISHERS,
        json: json,
        generalQuery,
        facetQuery
    };
}

export function resetPublisherSearch(generalQuery: string): FacetAction {
    return {
        type: actionTypes.FACET_RESET_PUBLISHERS,
        generalQuery
    };
}

export function fetchPublisherSearchResults(
    generalQuery: string,
    facetQuery: string
) {
    return (dispatch: FacetAction => void) => {
        console.log(facetQuery);

        if (facetQuery && facetQuery.length > 0) {
            dispatch(requestPublishers(generalQuery, facetQuery));

            return fetch(
                config.searchApiUrl +
                    `facets/publisher/options?generalQuery=${encodeURIComponent(
                        generalQuery
                    )}&facetQuery=${facetQuery}&start=0&limit=10`
            )
                .then(response => {
                    if (response.status !== 200) {
                        throw new Error(response.statusText);
                    } else {
                        return response.json();
                    }
                })
                .then((json: FacetSearchJson) => {
                    return dispatch(
                        receivePublishers(generalQuery, facetQuery, json)
                    );
                })
                .catch(error =>
                    dispatch(
                        requestPublishersFailed({
                            title: error.name,
                            detail: error.message
                        })
                    )
                );
        } else {
            return dispatch(resetPublisherSearch(generalQuery));
        }
    };
}

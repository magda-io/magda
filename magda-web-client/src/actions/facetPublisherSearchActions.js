// @flow

import fetch from "isomorphic-fetch";
import { config } from "../config";
import { actionTypes } from "../constants/ActionTypes";
import type { FacetAction, FacetSearchJson } from "../helpers/datasetSearch";
import type { FetchError } from "../types";
import buildSearchQueryString from "../helpers/buildSearchQueryString";

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

export function receivePublishers(
    facetQuery: string,
    json: Object
): FacetAction {
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
    generalQuery: string,
    facetQuery: string
) {
    return (dispatch: FacetAction => void) => {
        if (facetQuery && facetQuery.length > 0) {
            dispatch(requestPublishers(facetQuery));

            const generalQueryString = buildSearchQueryString({
                ...generalQuery,
                start: 0,
                limit: 10,
                q: null,
                publisher: null
            });

            return fetch(
                config.searchApiUrl +
                    `facets/publisher/options?generalQuery=${encodeURIComponent(
                        generalQuery.q || "*"
                    )}&${generalQueryString}&facetQuery=${facetQuery}`,
                {
                    credentials: "same-origin"
                }
            )
                .then(response => {
                    if (response.status !== 200) {
                        throw new Error(response.statusText);
                    } else {
                        return response.json();
                    }
                })
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

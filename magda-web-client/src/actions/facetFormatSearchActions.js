// @flow

import fetch from "isomorphic-fetch";
import { config } from "../config";
import { actionTypes } from "../constants/ActionTypes";
import type { FacetAction, FacetSearchJson } from "../helpers/datasetSearch";
import buildSearchQueryString from "../helpers/buildSearchQueryString";

export function requestFormats(facetQuery: string): FacetAction {
    return {
        type: actionTypes.FACET_REQUEST_FORMATS,
        facetQuery
    };
}

export function receiveFormats(facetQuery: string, json: Object): FacetAction {
    return {
        type: actionTypes.FACET_RECEIVE_FORMATS,
        json: json,
        facetQuery
    };
}

export function requestFormatsFailed(
    facetQuery: string,
    error: Object
): FacetAction {
    return {
        type: actionTypes.FACET_REQUEST_FORMATS_FAILED,
        error,
        facetQuery
    };
}

export function resetFormatSearch(): FacetAction {
    return {
        type: actionTypes.FACET_RESET_FORMATS
    };
}

export function fetchFormatSearchResults(
    generalQuery: object,
    facetQuery: string
): Object {
    return (dispatch: Function) => {
        if (facetQuery && facetQuery.length > 0) {
            dispatch(requestFormats(facetQuery));

            const generalQueryString = buildSearchQueryString({
                ...generalQuery,
                start: 0,
                limit: 10,
                q: null,
                format: null
            });

            const url: string =
                config.searchApiUrl +
                `facets/format/options?generalQuery=${encodeURIComponent(
                    generalQuery.q || "*"
                )}&${generalQueryString}&facetQuery=${facetQuery}`;

            return fetch(url, {
                credentials: "same-origin"
            })
                .then(response => {
                    if (response.status === 200) {
                        return response.json();
                    }
                    throw new Error(response.statusText);
                })
                .then((json: FacetSearchJson) => {
                    return dispatch(receiveFormats(facetQuery, json));
                })
                .catch(error =>
                    dispatch(
                        requestFormatsFailed(facetQuery, {
                            title: error.name,
                            detail: error.message
                        })
                    )
                );
        } else {
            return dispatch(resetFormatSearch());
        }
    };
}

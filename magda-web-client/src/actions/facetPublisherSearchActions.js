// @flow

import fetch from "isomorphic-fetch";
import { config } from "../config";
import { actionTypes } from "../constants/ActionTypes";
import type { FacetAction, FacetSearchJson } from "../helpers/datasetSearch";
import type { FetchError } from "../types";

export function requestPublishers(generalQuery: string): FacetAction {
    return {
        type: actionTypes.FACET_REQUEST_PUBLISHERS,
        generalQuery
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
    json: Object
): FacetAction {
    return {
        type: actionTypes.FACET_RECEIVE_PUBLISHERS,
        json: json,
        generalQuery
    };
}

export function fetchPublisherSearchResults(generalQuery: string) {
    return (dispatch: FacetAction => void) => {
        dispatch(requestPublishers(generalQuery));
        return fetch(
            config.searchApiUrl +
                `facets/publisher/options?generalQuery=${encodeURIComponent(
                    generalQuery
                )}&start=0&limit=10000`
        )
            .then(response => {
                if (response.status !== 200) {
                    throw new Error(response.statusText);
                } else {
                    return response.json();
                }
            })
            .then((json: FacetSearchJson) => {
                return dispatch(receivePublishers(generalQuery, json));
            })
            .catch(error =>
                dispatch(
                    requestPublishersFailed({
                        title: error.name,
                        detail: error.message
                    })
                )
            );
    };
}

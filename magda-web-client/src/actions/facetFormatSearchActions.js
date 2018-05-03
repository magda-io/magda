// @flow

import fetch from "isomorphic-fetch";
import { config } from "../config";
import { actionTypes } from "../constants/ActionTypes";
import type { FacetAction, FacetSearchJson } from "../helpers/datasetSearch";

export function requestFormats(generalQuery: string): FacetAction {
    return {
        type: actionTypes.FACET_REQUEST_FORMATS,
        generalQuery
    };
}

export function receiveFormats(
    generalQuery: string,
    json: Object
): FacetAction {
    return {
        type: actionTypes.FACET_RECEIVE_FORMATS,
        json: json,
        generalQuery
    };
}

export function requestFormatsFailed(error: Object): FacetAction {
    return {
        type: actionTypes.FACET_REQUEST_FORMATS_FAILED,
        error
    };
}

export function fetchFormatSearchResults(generalQuery: string): Object {
    return (dispatch: Function) => {
        dispatch(requestFormats(generalQuery));
        let url: string =
            config.searchApiUrl +
            `facets/format/options?generalQuery=${encodeURIComponent(
                generalQuery
            )}&start=0&limit=10000`;
        return fetch(url)
            .then(response => {
                if (response.status === 200) {
                    return response.json();
                }
                throw new Error(response.statusText);
            })
            .then((json: FacetSearchJson) => {
                return dispatch(receiveFormats(generalQuery, json));
            })
            .catch(error =>
                dispatch(
                    requestFormatsFailed({
                        title: error.name,
                        detail: error.message
                    })
                )
            );
    };
}

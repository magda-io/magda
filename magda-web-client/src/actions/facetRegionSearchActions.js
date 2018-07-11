// @flow

import fetch from "isomorphic-fetch";
import { config } from "../config";
import { actionTypes } from "../constants/ActionTypes";
import type { FacetAction, FacetSearchJson } from "../helpers/datasetSearch";
import type { FetchError } from "../types";

export function requestRegions(facetQuery: string): FacetAction {
    return {
        type: actionTypes.FACET_REQUEST_REGIONS,
        facetQuery
    };
}

export function receiveRegions(facetQuery: string, json: Object): FacetAction {
    return {
        type: actionTypes.FACET_RECEIVE_REGIONS,
        json: json,
        facetQuery
    };
}

export function requestRegionsFailed(error: FetchError): FacetAction {
    return {
        type: actionTypes.FACET_RECEIVE_REGIONS_ERROR
    };
}

export function fetchRegionSearchResults(facetQuery: string): Store {
    return (dispatch: Dispatch) => {
        dispatch(requestRegions(facetQuery));
        return fetch(config.searchApiUrl + `regions?query=${facetQuery}`)
            .then(response => {
                if (response.status === 200) {
                    return response.json();
                }
                throw new Error(response.status);
            })
            .then((json: FacetSearchJson) =>
                dispatch(receiveRegions(facetQuery, json))
            )
            .catch(error =>
                dispatch(
                    requestRegionsFailed({
                        title: error.name,
                        detail: error.message
                    })
                )
            );
    };
}

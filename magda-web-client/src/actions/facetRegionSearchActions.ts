import fetch from "isomorphic-fetch";
import { config } from "../config";
import { actionTypes } from "../constants/ActionTypes";
import { FacetAction, FacetSearchJson } from "../helpers/datasetSearch";
import { FetchError, Dispatch } from "../types";

export function requestRegions(facetQuery: string): FacetAction {
    return {
        type: actionTypes.FACET_REQUEST_REGIONS,
        facetQuery
    };
}

export function receiveRegions(facetQuery: string, json: any): FacetAction {
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

export function fetchRegionSearchResults(facetQuery: string) {
    return (dispatch: Dispatch) => {
        dispatch(requestRegions(facetQuery));
        return fetch(
            config.searchApiUrl + `regions?query=${facetQuery}`,
            config.commonFetchRequestOptions
        )
            .then((response) => {
                if (response.status === 200) {
                    return response.json();
                }
                throw new Error(response.status.toString());
            })
            .then((json: FacetSearchJson) =>
                dispatch(receiveRegions(facetQuery, json))
            )
            .catch((error) =>
                dispatch(
                    requestRegionsFailed({
                        title: error.name,
                        detail: error.message
                    })
                )
            );
    };
}

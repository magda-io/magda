import fetch from "isomorphic-fetch";
import { config } from "../config";
import { actionTypes } from "../constants/ActionTypes";
import { FetchError } from "../types";
import { FacetAction, FacetSearchJson } from "../helpers/datasetSearch";

export function requestRegionMapping(): FacetAction {
    return {
        type: actionTypes.REQUEST_REGION_MAPPING
    };
}

export function receiveRegionMapping(json: any): FacetAction {
    return {
        type: actionTypes.RECEIVE_REGION_MAPPING,
        json: json
    };
}

export function requestRegionMappingError(error: FetchError): FacetAction {
    return {
        type: actionTypes.REQUEST_REGION_MAPPING_ERROR,
        error
    };
}

export function fetchRegionMapping() {
    return (dispatch: Function) => {
        dispatch(requestRegionMapping());
        return fetch(
            config.searchApiUrl + "region-types",
            config.commonFetchRequestOptions
        )
            .then((response) => {
                if (response.status === 200) {
                    return response.json();
                }
                let errorMessage = response.statusText;
                if (!errorMessage)
                    errorMessage = "Failed to retrieve network resource.";
                throw new Error(errorMessage);
            })
            .then((json: FacetSearchJson) => {
                return dispatch(receiveRegionMapping(json));
            })
            .catch((error) =>
                dispatch(
                    requestRegionMappingError({
                        title: error.name,
                        detail: error.message
                    })
                )
            );
    };
}

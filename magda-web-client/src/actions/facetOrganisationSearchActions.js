// @flow

import fetch from "isomorphic-fetch";
import { config } from "../config";
import { actionTypes } from "../constants/ActionTypes";
import type { FacetAction, FacetSearchJson } from "../helpers/datasetSearch";
import type { FetchError } from "../types";

export function requestOrganisations(generalQuery: string): FacetAction {
    return {
        type: actionTypes.FACET_REQUEST_ORGANISATIONS,
        generalQuery
    };
}

export function requestOrganisationsFailed(error: FetchError): FacetAction {
    return {
        type: actionTypes.FACET_REQUEST_ORGANISATIONS_FAILED,
        error
    };
}

export function receiveOrganisations(
    generalQuery: string,
    json: Object
): FacetAction {
    return {
        type: actionTypes.FACET_RECEIVE_ORGANISATIONS,
        json: json,
        generalQuery
    };
}

export function fetchOrganisationSearchResults(generalQuery: string) {
    return (dispatch: FacetAction => void) => {
        dispatch(requestOrganisations(generalQuery));
        return fetch(
            config.searchApiUrl +
                `facets/organisation/options?generalQuery=${encodeURIComponent(
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
                return dispatch(receiveOrganisations(generalQuery, json));
            })
            .catch(error =>
                dispatch(
                    requestOrganisationsFailed({
                        title: error.name,
                        detail: error.message
                    })
                )
            );
    };
}

// @flow

import fetch from "isomorphic-fetch";
import { config } from "../config";
import { actionTypes } from "../constants/ActionTypes";
import type { FetchError } from "../types";
import type { FacetAction } from "../helpers/datasetSearch";

export function requestOrganisations(): FacetAction {
    return {
        type: actionTypes.REQUEST_ORGANISATIONS
    };
}

export function receiveOrganisations(json: Object): FacetAction {
    return {
        type: actionTypes.RECEIVE_ORGANISATIONS,
        json
    };
}

export function requestOrganisationsError(error: FetchError): FacetAction {
    return {
        type: actionTypes.REQUEST_ORGANISATIONS_ERROR,
        error
    };
}

export function requestOrganisation(): FacetAction {
    return {
        type: actionTypes.REQUEST_ORGANISATION
    };
}

export function receiveOrganisation(json: Object): FacetAction {
    return {
        type: actionTypes.RECEIVE_ORGANISATION,
        json
    };
}

export function requestOrganisationError(error: FetchError): FacetAction {
    return {
        type: actionTypes.REQUEST_ORGANISATION_ERROR,
        error
    };
}

function fetchOrganisations(start) {
    return (dispatch: Function) => {
        dispatch(requestOrganisations());
        const url = `${
            config.registryApiUrl
        }records?aspect=organization-details&limit=1000`;
        return fetch(url)
            .then(response => {
                if (response.status === 200) {
                    return response.json();
                }
                throw new Error(response.statusText);
            })
            .then(json => {
                return dispatch(receiveOrganisations(json));
            })
            .catch(error =>
                dispatch(
                    requestOrganisationsError({
                        title: error.name,
                        detail: error.message
                    })
                )
            );
    };
}

function shouldFetchOrganisations(state) {
    const organisation = state.organisation;
    if (organisation.isFetchingOrganisations) {
        return false;
    }
    return true;
}

export function fetchOrganisationsIfNeeded(start: number): Object {
    return (dispatch: Function, getState: Function) => {
        if (shouldFetchOrganisations(getState())) {
            return dispatch(fetchOrganisations(start));
        } else {
            return Promise.resolve();
        }
    };
}

function fetchOrganisation(id) {
    return (dispatch: Function) => {
        dispatch(requestOrganisation());
        const url = `${
            config.registryApiUrl
        }records/${id}?aspect=organization-details`;
        console.log(url);
        return fetch(url)
            .then(response => {
                if (response.status === 200) {
                    return response.json();
                }
                throw new Error(response.statusText);
            })
            .then(json => {
                return dispatch(receiveOrganisation(json));
            })
            .catch(error =>
                dispatch(
                    requestOrganisationError({
                        title: error.name,
                        detail: error.message
                    })
                )
            );
    };
}

function shouldFetchOrganisation(state) {
    const organisation = state.organisation;
    if (organisation.isFetchingOrganisation) {
        return false;
    }
    return true;
}

export function fetchOrganisationIfNeeded(id: number): Object {
    return (dispatch: Function, getState: Function) => {
        if (shouldFetchOrganisation(getState())) {
            return dispatch(fetchOrganisation(id));
        } else {
            return Promise.resolve();
        }
    };
}

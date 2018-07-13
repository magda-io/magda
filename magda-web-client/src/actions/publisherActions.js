// @flow

import fetch from "isomorphic-fetch";
import { config } from "../config";
import { actionTypes } from "../constants/ActionTypes";
import type { FetchError } from "../types";
import type { FacetAction } from "../helpers/datasetSearch";

export function requestPublishers(): FacetAction {
    return {
        type: actionTypes.REQUEST_PUBLISHERS
    };
}

export function receivePublishers(json: Object, keyword: string): FacetAction {
    return {
        type: actionTypes.RECEIVE_PUBLISHERS,
        json,
        keyword
    };
}

export function requestPublishersError(error: FetchError): FacetAction {
    return {
        type: actionTypes.REQUEST_PUBLISHERS_ERROR,
        error
    };
}

export function requestPublisher(): FacetAction {
    return {
        type: actionTypes.REQUEST_PUBLISHER
    };
}

export function receivePublisher(json: Object): FacetAction {
    return {
        type: actionTypes.RECEIVE_PUBLISHER,
        json
    };
}

export function requestPublisherError(error: FetchError): FacetAction {
    return {
        type: actionTypes.REQUEST_PUBLISHER_ERROR,
        error
    };
}

function fetchPublishers(start, query) {
    return (dispatch: Function) => {
        dispatch(requestPublishers());
        const url = `${config.searchApiUrl +
            "organisations"}?query=${query}&start=${(start - 1) *
            config.resultsPerPage}&limit=${config.resultsPerPage}`;
        return fetch(url)
            .then(response => {
                if (response.status === 200) {
                    return response.json();
                }
                throw new Error(response.statusText);
            })
            .then(json => {
                return dispatch(receivePublishers(json, query));
            })
            .catch(error =>
                dispatch(
                    requestPublishersError({
                        title: error.name,
                        detail: error.message
                    })
                )
            );
    };
}

function shouldFetchPublishers(state) {
    const publisher = state.publisher;
    if (publisher.isFetchingPublishers) {
        return false;
    }
    return true;
}

export function fetchPublishersIfNeeded(start: number, query: string): Object {
    return (dispatch: Function, getState: Function) => {
        if (shouldFetchPublishers(getState())) {
            return dispatch(fetchPublishers(start, query));
        } else {
            return Promise.resolve();
        }
    };
}

function fetchPublisher(id) {
    return (dispatch: Function) => {
        dispatch(requestPublisher());
        const url = `${
            config.registryApiUrl
        }records/${id}?aspect=organization-details`;

        return fetch(url)
            .then(response => {
                if (response.status === 200) {
                    return response.json();
                }
                throw new Error(response.statusText);
            })
            .then(json => {
                return dispatch(receivePublisher(json));
            })
            .catch(error =>
                dispatch(
                    requestPublisherError({
                        title: error.name,
                        detail: error.message
                    })
                )
            );
    };
}

function shouldFetchPublisher(state) {
    const publisher = state.publisher;
    if (publisher.isFetchingPublisher) {
        return false;
    }
    return true;
}

export function fetchPublisherIfNeeded(id: number): Object {
    return (dispatch: Function, getState: Function) => {
        if (shouldFetchPublisher(getState())) {
            return dispatch(fetchPublisher(id));
        } else {
            return Promise.resolve();
        }
    };
}

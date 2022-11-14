import fetch from "isomorphic-fetch";
import { config } from "../config";
import { actionTypes } from "../constants/ActionTypes";
import { FetchError } from "../types";
import { FacetAction } from "../helpers/datasetSearch";
import { searchPublishers } from "api-clients/SearchApis";

export function requestPublishers(): FacetAction {
    return {
        type: actionTypes.REQUEST_PUBLISHERS
    };
}

export function receivePublishers(json: any, keyword: string): FacetAction {
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

export function receivePublisher(json: any): FacetAction {
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

export function resetFetchPublisher() {
    return {
        type: actionTypes.RESET_FETCH_PUBLISHER
    };
}

function fetchPublishers(start, query, searchResultsPerPage) {
    return (dispatch: Function) => {
        dispatch(requestPublishers());

        searchPublishers(query, start, searchResultsPerPage)
            .then((json) => {
                return dispatch(receivePublishers(json, query));
            })
            .catch((error) =>
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

export function fetchPublishersIfNeeded(start: number, query: string): any {
    return (dispatch: Function, getState: Function) => {
        const state = getState();
        if (shouldFetchPublishers(state)) {
            return dispatch(
                fetchPublishers(
                    start,
                    query,
                    state.content.configuration.searchResultsPerPage
                )
            );
        } else {
            return Promise.resolve();
        }
    };
}

function fetchPublisher(id) {
    return (dispatch: Function) => {
        dispatch(requestPublisher());
        const url = `${config.registryApiReadOnlyBaseUrl}records/${id}?aspect=organization-details`;

        return fetch(url, config.commonFetchRequestOptions)
            .then((response) => {
                if (!response.ok) {
                    let statusText = response.statusText;
                    // response.statusText are different in different browser, therefore we unify them here
                    if (response.status === 404) {
                        statusText = "Not Found";
                    }
                    throw Error(statusText);
                }
                return response.json();
            })
            .then((json) => {
                return dispatch(receivePublisher(json));
            })
            .catch((error) =>
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

export function fetchPublisherIfNeeded(id: number): any {
    return (dispatch: Function, getState: Function) => {
        if (shouldFetchPublisher(getState())) {
            return dispatch(fetchPublisher(id));
        } else {
            return Promise.resolve();
        }
    };
}

// @flow

import fetch from "isomorphic-fetch";
import { config } from "../config";
import { actionTypes } from "../constants/ActionTypes";
import type { Dispatch, GetState } from "../types";

export type ConnectorProps = {
    type: string,
    name: string,
    sourceUrl: ?string,
    schedule: ?string,
    id: string
};

export function requestConnectors() {
    return {
        type: actionTypes.REQUEST_CONNECTORS
    };
}

export function receiveConnectors(json: ConnectorProps) {
    return {
        type: actionTypes.RECEIVE_CONNECTORS,
        json
    };
}

export function requestConnectorsError(error: number) {
    return {
        type: actionTypes.REQUEST_CONNECTORS_ERROR,
        error
    };
}

export function requestDatasetSearchResults() {
    return {
        type: actionTypes.REQUEST_DATASET_SEARCH_RESULTS
    };
}

export function requestDatasetSearchResultsError(error) {
    return {
        type: actionTypes.REQUEST_DATASET_SEARCH_RESULTS_ERROR,
        error
    };
}

export function receiveDatasetSearchResults(json) {
    return {
        type: actionTypes.RECEIVE_DATASET_SEARCH_RESULTS,
        json
    };
}

export function requestConnectorConfig() {
    return {
        type: actionTypes.REQUEST_CONNECTOR_CONFIG
    };
}

export function receiveConnectorConfig(json) {
    return {
        type: actionTypes.RECEIVE_CONNECTOR_CONFIG,
        json
    };
}

export function requestConnectorConfigError(error: number) {
    return {
        type: actionTypes.REQUEST_CONNECTOR_CONFIG_ERROR,
        error
    };
}

export function updateConnectorConfig() {
    return {
        type: actionTypes.UPDATE_CONNECTOR
    };
}

export function updateConnectorSuccess(json) {
    return {
        type: actionTypes.UPDATE_CONNECTOR_SUCCESS,
        json
    };
}

export function updateConnectorFailure() {
    return {
        type: actionTypes.UPDATE_CONNECTOR_FAILURE
    };
}

export function createConnector() {
    return {
        type: actionTypes.CREATE_CONNECTOR
    };
}

export function createConnectorSuccess(json) {
    return {
        type: actionTypes.CREATE_CONNECTOR_SUCCESS,
        json
    };
}

export function createConnectorError(error: string) {
    return {
        type: actionTypes.CREATE_CONNECTOR_ERROR,
        error
    };
}

export function resetCreateConnector() {
    return {
        type: actionTypes.RESET_CREATE_CONNECTOR
    };
}

export function requestDatasetFromConnector() {
    return {
        type: actionTypes.REQUEST_DATASET_FROM_CONNECTOR
    };
}

export function requestDatasetFromConnectorError(error) {
    return {
        type: actionTypes.REQUEST_DATASET_FROM_CONNECTOR_ERROR,
        error
    };
}

export function receiveDatasetFromConnector(json) {
    return {
        type: actionTypes.RECEIVE_DATASET_FROM_CONNECTOR,
        json
    };
}

export function resetConnectorForm() {
    return (dispatch: Dispatch) => {
        return dispatch(resetCreateConnector());
    };
}

export function fetchConnectorConfigIfNeeded(connectorId) {
    return (dispatch: Dispatch, getState: GetState) => {
        if (!getState().connectors.isFetching) {
            return dispatch(fetchConnectorConfigFromRegistry(connectorId));
        } else {
            return Promise.resolve();
        }
    };
}

export function updateConnectorStatus() {}

export function fetchDatasetFromConnector(connectorId, datasetId) {
    return (dispatch: Dispatch) => {
        dispatch(requestDatasetFromConnector());
        let url: string = `${
            config.adminApiUrl
        }connectors/${connectorId}/interactive/datasets/${encodeURIComponent(
            datasetId
        )}`;
        console.log(url);
        return fetch(url, {
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json"
            },
            credentials: "include"
        })
            .then(response => {
                if (response.status >= 400) {
                    return dispatch(
                        requestDatasetFromConnectorError(response.status)
                    );
                }
                return response.json();
            })
            .then((json: Object) => {
                if (!json.error) {
                    dispatch(receiveDatasetFromConnector(json));
                }
            });
    };
}

export function validateConnectorName(name) {
    return (dispatch: Dispatch) => {
        if (!name || name.length === 0) {
            return dispatch(
                createConnectorError("Your new connector must have a type 😈")
            );
        }
        dispatch(requestConnectors());
        let url: string = `${config.adminApiUrl}connectors/`;
        console.log(url);
        return fetch(url, {
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json"
            },
            credentials: "include"
        })
            .then(response => {
                if (response.status >= 400) {
                    return dispatch(createConnectorError(response.status));
                }
                return response.json();
            })
            .then((json: Object) => {
                if (!json.error) {
                    //successfully get the current conenctors
                    dispatch(receiveConnectors(json));
                    if (json.some(item => item.id === encodeURI(name))) {
                        // illegal user name, dispatch error
                        return dispatch(
                            createConnectorError(
                                "Connector name already taken 😩"
                            )
                        );
                    }
                }
            });
    };
}

export function validateConnectorType(type) {
    return (dispatch: Dispatch) => {
        if (!type || type.length === 0) {
            return dispatch(
                createConnectorError("Your new connector must have a type 😈")
            );
        }
    };
}

export function updateConnectorsStatus(connectorId: string, action: string) {
    return (dispatch: Dispatch) => {
        dispatch(updateConnectorConfig());
        const url = `${config.adminApiUrl}connectors/${connectorId}/${action}`;
        return fetch(url, {
            method: "POST",
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json"
            },
            credentials: "include"
        })
            .then(response => {
                if (response.status === 200) {
                    return response.json();
                }
                return dispatch(updateConnectorFailure(response.status));
            })
            .then(result => {
                if (result.error) {
                    return false;
                }
                dispatch(updateConnectorSuccess(result));
                dispatch(fetchConnectorsIfNeeded());
            });
    };
}

export function createNewConnector(connectorProps: ConnectorProps) {
    return (dispatch: Dispatch) => {
        dispatch(createConnector());
        const url = `${config.adminApiUrl}connectors/${connectorProps.id}`;
        return fetch(url, {
            method: "PUT",
            body: JSON.stringify(connectorProps),
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json"
            },
            credentials: "include"
        })
            .then(response => {
                if (response.status === 200) {
                    return response.json();
                }
                return dispatch(createConnectorError(response.status));
            })
            .then(result => {
                if (result.error) {
                    return false;
                }
                dispatch(createConnectorSuccess(result));
                dispatch(fetchConnectorsIfNeeded());
            });
    };
}

export function deleteConnector(connectorId: string) {
    return (dispatch: Dispatch) => {
        dispatch(updateConnectorConfig());
        const url = `${config.adminApiUrl}connectors/${connectorId}/`;
        return fetch(url, {
            method: "DELETE",
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json"
            },
            credentials: "include"
        })
            .then(response => {
                if (response.status === 200) {
                    return response.json();
                }
                return dispatch(updateConnectorFailure(response.status));
            })
            .then(result => {
                if (result.error) {
                    return false;
                }
                dispatch(updateConnectorSuccess(result));
                dispatch(fetchConnectorsIfNeeded());
            });
    };
}

export function fetchConnectorsFromRegistry(): Object {
    return (dispatch: Dispatch) => {
        dispatch(requestConnectors());
        let url: string = `${config.adminApiUrl}connectors/`;
        console.log(url);
        return fetch(url, {
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json"
            },
            credentials: "include"
        })
            .then(response => {
                if (response.status >= 400) {
                    return dispatch(requestConnectorsError(response.status));
                }
                return response.json();
            })
            .then((json: Object) => {
                if (!json.error) {
                    dispatch(receiveConnectors(json));
                }
            });
    };
}

export function fetchConnectorConfigFromRegistry(connectorId): Object {
    return (dispatch: Dispatch) => {
        dispatch(requestConnectorConfig());
        let url: string = `${
            config.adminApiUrl
        }connectors/${connectorId}/interactive/config`;
        console.log(url);
        return fetch(url, {
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json"
            },
            credentials: "include"
        })
            .then(response => {
                if (response.status >= 400) {
                    return dispatch(
                        requestConnectorConfigError(response.status)
                    );
                }
                return response.json();
            })
            .then((json: Object) => {
                if (!json.error) {
                    dispatch(receiveConnectorConfig(json));
                }
            });
    };
}

export function fetchConnectorsIfNeeded() {
    return (dispatch: Dispatch, getState: GetState) => {
        if (!getState().connectors.isFetching) {
            return dispatch(fetchConnectorsFromRegistry());
        } else {
            return Promise.resolve();
        }
    };
}

export function fetchDatasetSearchResults(
    connectorId: string,
    query: string
): Store {
    return (dispatch: Dispatch) => {
        let url: string = `${
            config.adminApiUrl
        }connectors/${connectorId}/interactive/search/datasets?title=${query}`;
        console.log(url);
        dispatch(requestDatasetSearchResults(query));
        return fetch(url)
            .then((response: Object) => {
                if (response.status === 200) {
                    return response.json();
                }
                return dispatch(
                    requestDatasetSearchResultsError(response.status)
                );
            })
            .then(json => {
                if (!json.error) {
                    return dispatch(receiveDatasetSearchResults(json));
                }
            });
    };
}

export function shouldFetchDatasetSearchResults(state: Object): boolean {
    const connectors = state.connectors;
    if (connectors.isFetching) {
        return false;
    }
    return true;
}

export function fetchDatasetSearchResultsIfNeeded(
    connectorId: string,
    query: string
): Store {
    return (dispatch, getState) => {
        if (shouldFetchDatasetSearchResults(getState(), query)) {
            return dispatch(fetchDatasetSearchResults(connectorId, query));
        }
    };
}

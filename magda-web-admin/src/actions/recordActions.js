// @flow

import fetch from "isomorphic-fetch";
import { config } from "../config";
import { actionTypes } from "../constants/ActionTypes";
import type { RecordAction, RawDataset } from "../helpers/record";

export function requestDataset(id: string): RecordAction {
    return {
        type: actionTypes.REQUEST_DATASET,
        id
    };
}

export function receiveDataset(json: RawDataset): RecordAction {
    return {
        type: actionTypes.RECEIVE_DATASET,
        json
    };
}

export function requestDatasetError(error: number): RecordAction {
    return {
        type: actionTypes.REQUEST_DATASET_ERROR,
        error
    };
}

export function requestDistribution(id: string): RecordAction {
    return {
        type: actionTypes.REQUEST_DISTRIBUTION,
        id
    };
}

export function receiveDistribution(json: Object): RecordAction {
    return {
        type: actionTypes.RECEIVE_DISTRIBUTION,
        json
    };
}

export function requestDistributionError(error: number): RecordAction {
    return {
        type: actionTypes.REQUEST_DISTRIBUTION_ERROR,
        error
    };
}

export function fetchDatasetFromRegistry(id: string): Function {
    return (dispatch: Function) => {
        dispatch(requestDataset(id));
        let url: string =
            config.registryApiUrl +
            `records/${encodeURIComponent(
                id
            )}?aspect=dcat-dataset-strings&optionalAspect=dcat-distribution-strings&optionalAspect=dataset-distributions&optionalAspect=temporal-coverage&dereference=true&optionalAspect=dataset-publisher&optionalAspect=source&optionalAspect=link-status`;
        console.log(url);
        return fetch(url)
            .then(response => {
                if (response.status === 200) {
                    return response.json();
                }
                return dispatch(requestDatasetError(response.status));
            })
            .then((json: Object) => {
                if (!json.error) {
                    return dispatch(receiveDataset(json));
                }
            });
    };
}

export function fetchDistributionFromRegistry(id: string): Object {
    return (dispatch: Function) => {
        dispatch(requestDistribution(id));
        let url: string =
            config.registryApiUrl +
            `records/${encodeURIComponent(
                id
            )}?aspect=dcat-distribution-strings&optionalAspect=source-link-status&optionalAspect=visualization-info`;
        console.log(url);
        return fetch(url)
            .then(response => {
                if (response.status === 200) {
                    return response.json();
                }
                return dispatch(requestDistributionError(response.status));
            })
            .then((json: Object) => {
                if (!json.error) {
                    return dispatch(receiveDistribution(json));
                }
            });
    };
}

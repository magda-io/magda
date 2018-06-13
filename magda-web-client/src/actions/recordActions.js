// @flow

import fetch from "isomorphic-fetch";
import { config } from "../config";
import { actionTypes } from "../constants/ActionTypes";
import type { RecordAction, RawDataset } from "../helpers/record";
import type { FetchError } from "../types";

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

export function requestDatasetError(error: FetchError): RecordAction {
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

export function requestDistributionError(error: FetchError): RecordAction {
    return {
        type: actionTypes.REQUEST_DISTRIBUTION_ERROR,
        error
    };
}

export function fetchDatasetFromRegistry(id: string): Function {
    return (dispatch: Function) => {
        dispatch(requestDataset(id));
        let parameters =
            "dereference=true&aspect=dcat-dataset-strings&optionalAspect=dcat-distribution-strings&optionalAspect=dataset-distributions&optionalAspect=temporal-coverage&optionalAspect=dataset-publisher&optionalAspect=source&optionalAspect=link-status&optionalAspect=dataset-quality-rating";
        let url: string;
        if (id.startsWith("ds-")) {
            url =
                config.registryApiUrl +
                `records/${encodeURIComponent(id)}?${parameters}`;
        } else if (
            // lookup CKAN UUIDs
            id.match(
                /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g
            )
        ) {
            url =
                config.registryApiUrl +
                `records?aspectQuery=ckan-dataset.id:${encodeURIComponent(
                    id
                )}&${parameters}`;
        } else {
            // lookup CKAN dataset slugs
            url =
                config.registryApiUrl +
                `records?aspectQuery=ckan-dataset.name:${encodeURIComponent(
                    id
                )}&${parameters}`;
        }
        return fetch(url)
            .then(response => {
                if (response.status === 200) {
                    return response.json();
                }
                throw new Error(response.statusText);
            })
            .then((json: Object) => {
                if (json.records) {
                    if (json.records.length > 0) {
                        return dispatch(receiveDataset(json.records[0]));
                    } else {
                        throw new Error("Not Found");
                    }
                } else {
                    return dispatch(receiveDataset(json));
                }
            })
            .catch(error =>
                dispatch(
                    requestDatasetError({
                        title: error.name,
                        detail: error.message
                    })
                )
            );
    };
}

export function fetchDistributionFromRegistry(id: string): Object {
    return (dispatch: Function) => {
        dispatch(requestDistribution(id));
        let url: string =
            config.registryApiUrl +
            `records/${encodeURIComponent(
                id
            )}?aspect=dcat-distribution-strings&optionalAspect=source-link-status&optionalAspect=visualization-info&optionalAspect=dataset-format`;
        return fetch(url)
            .then(response => {
                if (response.status === 200) {
                    return response.json();
                }
                throw new Error(response.statusText);
            })
            .then((json: Object) => {
                return dispatch(receiveDistribution(json));
            })
            .catch(error =>
                dispatch(
                    requestDistributionError({
                        title: error.name,
                        detail: error.message
                    })
                )
            );
    };
}

// @flow

import fetch from 'isomorphic-fetch'
import {config} from '../config'
import {actionTypes} from '../constants/ActionTypes';
import type { Action, Dataset } from '../types';

export function requestDataset(id: string):Action {
  return {
    type: actionTypes.REQUEST_DATASET,
    id
  }
}

export function receiveDataset(json: Object): Action {
  return {
    type: actionTypes.RECEIVE_DATASET,
    json,
  }
}

export function requestDatasetError(error: Object): Action {
  return {
    type: actionTypes.REQUEST_DATASET_ERROR,
    error,
  }
}

export function datasetNotFound(): Action {
  return {
    type: actionTypes.DATASET_NOT_FOUND,
  }
}

export function fetchDatasetFromRegistry(id: string):Object{
  return (dispatch: Function)=>{
    dispatch(requestDataset(id))
    let url : string = config.registryUrl + `${encodeURIComponent(id)}?aspect=dcat-dataset-strings&optionalAspect=dataset-distributions&dereference=true`;
    return fetch(url)
    .then(response => {
        if (response.status >= 400) {
            dispatch(requestDatasetError(response));
            throw new Error("Bad response from server");
        } else if ( false ){
            dispatch(datasetNotFound())
        }
        return response.json();
    })
    .then((json: Dataset) => dispatch(receiveDataset(json))
    )
  }
}

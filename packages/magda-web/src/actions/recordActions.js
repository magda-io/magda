// @flow

import fetch from 'isomorphic-fetch'
import {config} from '../config'
import {actionTypes} from '../constants/ActionTypes';
import type { Action, Dataset } from '../types';

export function requestDataset(id: string):Action {
  return {
    type: actionTypes.REQUEST_RECORD,
    id
  }
}

export function receiveDataset(json: Object): Action {
  return {
    type: actionTypes.RECEIVE_RECORD,
    json,
  }
}

export function requestDatasetError(error: Object): Action {
  return {
    type: actionTypes.REQUEST_RECORD_ERROR,
    error,
  }
}

export function datasetNotFound(): Action {
  return {
    type: actionTypes.RECORD_NOT_FOUND,
  }
}

export function fetchRecordFromRegistry(id: string):Object{
  return (dispatch: Function)=>{
    dispatch(requestDataset(id))
    let url : string = config.registryUrl + `${encodeURIComponent(id)}?optionalAspect=dcat-dataset-strings&optionalAspect=dcat-distribution-strings&optionalAspect=dataset-distributions&dereference=true`;
    console.log(url);
    return fetch(url)
    .then(response => {
        if (response.status >= 400) {
          if(response.status === 404){
            return dispatch(datasetNotFound());
          }
            return dispatch(requestDatasetError(response));
        } 
        return response.json();
    })
    .then((json: Dataset) => dispatch(receiveDataset(json))
    )
  }
}


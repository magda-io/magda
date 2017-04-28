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

export function requestDistribution(id: string):Action {
  return {
    type: actionTypes.REQUEST_DISTRIBUTION,
    id
  }
}

export function receiveDistribution(json: Object): Action {
  return {
    type: actionTypes.RECEIVE_DISTRIBUTION,
    json,
  }
}

export function requestDistributionError(error: Object): Action {
  return {
    type: actionTypes.REQUEST_DISTRIBUTION_ERROR,
    error,
  }
}

export function distributiontNotFound(): Action {
  return {
    type: actionTypes.DISTRIBUTION_NOT_FOUND,
  }
}

export function fetchDatasetFromRegistry(id: string):Object{
  return (dispatch: Function)=>{
    dispatch(requestDataset(id))
    let url : string = config.registryUrl + `${encodeURIComponent(id)}?aspect=dcat-dataset-strings&optionalAspect=dcat-distribution-strings&optionalAspect=dataset-distributions&dereference=true`;
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


export function fetchDistributionFromRegistry(id: string):Object{
  return (dispatch: Function)=>{
    dispatch(requestDistribution(id))
    let url : string = config.registryUrl + `${encodeURIComponent(id)}?aspect=dcat-distribution-strings`;
    console.log(url);
    return fetch(url)
    .then(response => {
        if (response.status >= 400) {
          if(response.status === 404){
            return dispatch(distributiontNotFound());
          }
            return dispatch(requestDistributionError(response));
        } 
        return response.json();
    })
    .then((json: Dataset) => dispatch(receiveDistribution(json))
    )
  }
}


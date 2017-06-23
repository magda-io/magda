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

export function requestDatasetError(error: number): Action {
  return {
    type: actionTypes.REQUEST_DATASET_ERROR,
    error,
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

export function requestDistributionError(error: number): Action {
  return {
    type: actionTypes.REQUEST_DISTRIBUTION_ERROR,
    error,
  }
}


export function fetchDatasetFromRegistry(id: string):Function{
  return (dispatch: Function)=>{
    dispatch(requestDataset(id))
    let url : string = config.registryUrl + `/${encodeURIComponent(id)}?aspect=dcat-dataset-strings&optionalAspect=dcat-distribution-strings&optionalAspect=dataset-distributions&optionalAspect=temporal-coverage&optionalAspect=spatial&dereference=true&optionalAspect=dataset-publisher`;
    console.log(url);
    return fetch(url)
    .then(response => {
        if (response.status === 200) {
            return response.json()
        }
        return dispatch(requestDatasetError(response.status));
    })
    .then((json: Dataset) => {
      if(!json.error){
        return dispatch(receiveDataset(json));
        }
      }
    )
  }
}


export function fetchDistributionFromRegistry(id: string):Object{
  return (dispatch: Function)=>{
    dispatch(requestDistribution(id))
    let url : string = config.registryUrl + `/${encodeURIComponent(id)}?aspect=dcat-distribution-strings`;
    console.log(url);
    return fetch(url)
    .then(response => {
        if (response.status === 200) {
            return response.json()
        }
        return dispatch(requestDistributionError(response.status));
    })
    .then((json: Dataset) => {
      if(!json.error){
          return dispatch(receiveDistribution(json));
        }
      }
    )
  }
}

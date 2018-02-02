// @flow
import fetch from 'isomorphic-fetch'
import {config} from '../config'
import {actionTypes} from '../constants/ActionTypes';
import type { Error } from '../types';
import type {FacetAction, FacetSearchJson} from '../helpers/datasetSearch';


export function requestRegionMapping(): FacetAction{
  return {
    type: actionTypes.REQUEST_REGION_MAPPING,
  }
}

export function receiveRegionMapping(json: Object): FacetAction{
  return {
    type: actionTypes.RECEIVE_REGION_MAPPING,
    json: json,
  }
}

export function requestRegionMappingError(error: Error): FacetAction {
  return {
    type: actionTypes.REQUEST_REGION_MAPPING_ERROR,
    error,
  }
}

export function fetchRegionMapping() {
  return (dispatch: Function)=>{
    dispatch(requestRegionMapping())
    return fetch(config.searchApiUrl + 'region-types')
    .then(response=>{
      if (response.status !== 200) {
        return dispatch(requestRegionMappingError({title: response.status, detail: response.statusText}));
      }
      else {
        return response.json()
      }
    })
    .then((json: FacetSearchJson) =>{
        if(!json.error){
          return dispatch(receiveRegionMapping(json));
        } else{
            return dispatch(requestRegionMappingError(json.error))
        }
      }
    )
    .catch(error => dispatch(requestRegionMappingError(error)));
  }
}

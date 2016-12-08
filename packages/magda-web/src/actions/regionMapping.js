import fetch from 'isomorphic-fetch'
import config from '../config'
import {actionTypes} from '../constants/ActionTypes';

export function requestRegionMapping(){
  return {
    type: actionTypes.REQUEST_REGION_MAPPING,
  }
}

export function receiveRegionMapping(json){
  return {
    type: actionTypes.RECEIVE_REGION_MAPPING,
    json: json,
  }
}

export function fetchRegionMapping() {
  return (dispatch)=>{
    dispatch(requestRegionMapping())
    return fetch(config().searchApiBaseUrl + 'region-types')
    .then(response => response.json())
    .then(json =>
      dispatch(receiveRegionMapping(json))
    )
  }
}

import fetch from 'isomorphic-fetch'
import {config} from '../config'
import {actionTypes} from '../constants/ActionTypes';

export function requestRegions(query){
  return {
    type: actionTypes.REQUEST_REGIONS,
    query
  }
}

export function receiveRegions(query, json){
  return {
    type: actionTypes.RECEIVE_REGIONS,
    json: json,
    query
  }
}

export function fetchRegionSearchResults(query) {
  return (dispatch)=>{
    dispatch(requestRegions(query))
    return fetch(config.searchApiBaseUrl + `regions/search?query=${query}`)
    .then(response => response.json())
    .then(json =>
      dispatch(receiveRegions(query, json))
    )
  }
}

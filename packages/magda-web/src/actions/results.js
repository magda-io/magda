// @flow 
import fetch from 'isomorphic-fetch'
import parseQuery from '../helpers/parseQuery'
import {config} from '../config'
import {actionTypes} from '../constants/ActionTypes';
import type { Action, JsonData } from '../types';


export function requestResults(apiQuery: string ): Action{
  return {
    type: actionTypes.REQUEST_RESULTS,
    apiQuery
  }
}

export function receiveResults(apiQuery: string, json: JsonData): Action{
  return {
    type: actionTypes.RECEIVE_RESULTS,
    apiQuery,
    json,
  }
}

export function transferFailed(errorMessage: string): Action{
  return {
    type: actionTypes.FETCH_ERROR,
    errorMessage
  }
}

export function fetchSearchResults(query: string) {
  return (dispatch: Function)=>{
    let url : string = config.searchApiBaseUrl + `datasets/search?query=${query}`;
    dispatch(requestResults(query))
    return fetch(url)
    .then(response => {
      if (response.status >= 400) {
        dispatch(transferFailed('Bad response from server'))
      }
      return response.json()}
    )
    .then((json: JsonData) =>
      dispatch(receiveResults(query, json))
    )
  }
}

export function shouldFetchSearchResults(state: Object, query: string): boolean{
  const results = state.results;
  if(!results){
    return false
  } else if(results.isFetching){
    return false
  } else if(query !== results.apiQuery){
    return true
  } else{
    return false
  }
}

export function fetchSearchResultsIfNeeded(urlQueryObject: Object){
  let apiQuery = parseQuery(urlQueryObject);
  return (dispatch: Function, getState: Function )=>{
    if(shouldFetchSearchResults(getState(), apiQuery)){
      return dispatch(fetchSearchResults(apiQuery))
    }
  }
}

export function addPublisher(publisher: string): Action{
  return {
    type: actionTypes.ADD_PUBLISHER,
    item: publisher
  }
}

export function removePublisher(publisher: string): Action{
  return {
    type: actionTypes.REMOVE_PUBLISHER,
    item: publisher
  }
}

export function resetPublisher(): Action{
  return {
    type: actionTypes.RESET_PUBLISHER,
  }
}

export function addFormat(format: string): Action {
  return {
    type: actionTypes.ADD_FORMAT,
    item: format
  }
}

export function removeFormat(format: string): Action{
  return {
    type: actionTypes.REMOVE_FORMAT,
    item: format
  }
}

export function resetFormat(): Action{
  return {
    type: actionTypes.RESET_FORMAT,
  }
}

export function addRegion(region: string): Action{
  return {
    type: actionTypes.ADD_REGION,
    item: region
  }
}

export function resetRegion(): Action{
  return {
    type: actionTypes.RESET_REGION,
  }
}


export function setDateFrom(date: string): Action{
  return {
    type: actionTypes.SET_DATE_FROM,
    item: date
  }
}

export function setDateTo(date: string): Action{
  return {
    type: actionTypes.SET_DATE_TO,
    item: date
  }
}

export function resetDateFrom(): Action{
  return {
    type: actionTypes.RESET_DATE_FROM
  }
}

export function resetDateTo(): Action{
  return {
    type: actionTypes.RESET_DATE_TO
  }
}

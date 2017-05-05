// @flow 
import fetch from 'isomorphic-fetch'
import parseQuery from '../helpers/parseQuery'
import {config} from '../config'
import {actionTypes} from '../constants/ActionTypes';
import type { DataAction, Action, DataSearchJson } from '../types';


export function requestResults(apiQuery: string ): Action{
  return {
    type: actionTypes.REQUEST_RESULTS,
    apiQuery
  }
}

export function receiveResults(apiQuery: string, json: DataSearchJson): DataAction{
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


export function fetchSearchResults(query: string): Store {
  return (dispatch: Dispatch)=>{
    let url : string = config.searchApiBaseUrl + `search/datasets?query=${query}`;
    dispatch(requestResults(query))
    return fetch(url)
    .then(response => {
      if (response.status >= 400) {
        dispatch(transferFailed('Bad response from server'))
      }
      return response.json()}
    )
    .then((json: DataSearchJson) =>
      dispatch(receiveResults(query, json))
    )
  }
}

export function shouldFetchSearchResults(state: Object, keyword: string, query: string): boolean{
  const results = state.results;
  if(!results || !keyword || keyword.length === 0 ){
    return false
  } else if(results.isFetching){
    return false
  } else if(query !== results.apiQuery){
    return true
  } else{
    return false
  }
}

export function fetchSearchResultsIfNeeded(urlQueryObject: Object): Store {
  const apiQuery = parseQuery(urlQueryObject);

  return (dispatch, getState)=>{
    if(shouldFetchSearchResults(getState(), urlQueryObject.q,  apiQuery)){
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


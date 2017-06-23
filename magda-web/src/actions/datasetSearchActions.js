// @flow
import fetch from 'isomorphic-fetch'
import parseQuery from '../helpers/parseQuery'
import {config} from '../config'
import {actionTypes} from '../constants/ActionTypes';
import type {Action, DataSearchJson } from '../types';


export function requestResults(apiQuery: string ): Action{
  return {
    type: actionTypes.REQUEST_RESULTS,
    apiQuery
  }
}

export function receiveResults(apiQuery: string, json: DataSearchJson): Action{
  return {
    type: actionTypes.RECEIVE_RESULTS,
    apiQuery,
    json,
  }
}

export function transferFailed(error: number): Action{
  return {
    type: actionTypes.FETCH_ERROR,
    error
  }
}

export function resetDatasetSearch(): Action{
  return {
    type: actionTypes.RESET_DATASET_SEARCH
  }
}


export function fetchSearchResults(query: string): Store {
  return (dispatch: Dispatch)=>{
    let url : string = config.searchApiBaseUrl + `datasets?query=${query}`;
    console.log(url);
    dispatch(requestResults(query))
    return fetch(url)
    .then((response: Object) => {
      if (response.status === 200) {
          return response.json();
      }
      return dispatch(transferFailed(response.status))
    })
    .then((json: DataSearchJson) =>{
        if(!json.error){
            return dispatch(receiveResults(query, json));
        }
      }
    )
  }
}

export function shouldFetchSearchResults(state: Object, keyword: string, query: string): boolean{
  const datasetSearch = state.datasetSearch;
  if(!datasetSearch || !keyword || keyword.length === 0 ){
    return false
  } else if(datasetSearch.isFetching){
    return false
  } else if(query !== datasetSearch.apiQuery){
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

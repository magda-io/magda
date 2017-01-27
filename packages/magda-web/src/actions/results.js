import fetch from 'isomorphic-fetch'
import parseQuery from '../helpers/parseQuery'
import {config} from '../config'
import {actionTypes} from '../constants/ActionTypes';

export function requestResults(apiQuery){
  return {
    type: actionTypes.REQUEST_RESULTS,
    apiQuery
  }
}

export function receiveResults(apiQuery, json){
  return {
    type: actionTypes.RECEIVE_RESULTS,
    apiQuery,
    json,
  }
}

export function transferFailed(errorMessage){
  return {
    type: actionTypes.FETCH_ERROR,
    errorMessage
  }
}

export function fetchSearchResults(query) {
  return (dispatch)=>{
    console.log(config.searchApiBaseUrl + `datasets/search?query=${query}`);
    dispatch(requestResults(query))
    return fetch(config.searchApiBaseUrl + `datasets/search?query=${query}`)
    .then(response => {
      if (response.status >= 400) {
        dispatch(transferFailed('Bad response from server'))
      }
      return response.json()}
    )
    .then(json =>
      dispatch(receiveResults(query, json))
    )
  }
}

export function shouldFetchSearchResults(state, query){
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

export function fetchSearchResultsIfNeeded(urlQueryObject){
  let apiQuery = parseQuery(urlQueryObject);
  return (dispatch, getState)=>{
    if(shouldFetchSearchResults(getState(), apiQuery)){
      return dispatch(fetchSearchResults(apiQuery))
    }
  }
}

export function addPublisher(publisher){
  return {
    type: actionTypes.ADD_PUBLISHER,
    item: publisher
  }
}

export function removePublisher(publisher){
  return {
    type: actionTypes.REMOVE_PUBLISHER,
    item: publisher
  }
}

export function resetPublisher(){
  return {
    type: actionTypes.RESET_PUBLISHER,
  }
}

export function addFormat(format){
  return {
    type: actionTypes.ADD_FORMAT,
    item: format
  }
}

export function removeFormat(format){
  return {
    type: actionTypes.REMOVE_FORMAT,
    item: format
  }
}

export function resetFormat(){
  return {
    type: actionTypes.RESET_FORMAT,
  }
}

export function addRegion(region){
  return {
    type: actionTypes.ADD_REGION,
    item: region
  }
}

export function resetRegion(){
  return {
    type: actionTypes.RESET_REGION,
  }
}


export function setDateFrom(date){
  return {
    type: actionTypes.SET_DATE_FROM,
    item: date
  }
}

export function setDateTo(date){
  return {
    type: actionTypes.SET_DATE_TO,
    item: date
  }
}

export function resetDateFrom(){
  return {
    type: actionTypes.RESET_DATE_FROM
  }
}

export function resetDateTo(){
  return {
    type: actionTypes.RESET_DATE_TO
  }
}

import futch from '../helpers/futch';
import parseQuery from '../helpers/parseQuery'
import config from '../config'

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

export function updateProgress(progress){
  return{
    type: actionTypes.UPDATE_PROGRESS,
    progress
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
    console.log(config().searchApiBaseUrl + `datasets/search?query=${query}`);
    dispatch(requestResults(query))
    return futch(config().searchApiBaseUrl + `datasets/search?query=${query}`,
      (progressEvent)=>{
      dispatch(updateProgress(progressEvent.loaded / progressEvent.total))
      }
    )
    .then(json =>
      dispatch(receiveResults(query, json))
    )
    .catch((error)=>{
      dispatch(transferFailed(error))
    })
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

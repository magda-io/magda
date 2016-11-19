import fetch from 'isomorphic-fetch'
import parseQuery from '../helpers/parseQuery'

export const SET_URL_QUERY = 'SET_URL_QUERY'
export const REQUEST_RESULTS = 'REQUEST_RESULTS'
export const RECEIVE_RESULTS = 'RECEIVE_RESULTS'
export const ADD_PUBLISHER = 'ADD_PUBLISHER'
export const REMOVE_PUBLISHER = 'REMOVE_PUBLISHER'
export const RESET_PUBLISHER = 'RESET_PUBLISHER'

export const ADD_REGION = 'ADD_REGION'
export const RESET_REGION = 'RESET_REGION'

export const SET_DATE_FROM = 'SET_DATE_FROM'
export const SET_DATE_TO = 'SET_DATE_TO'

export const RESET_DATE_FROM = 'RESET_DATE_FROM';
export const RESET_DATE_TO = 'RESET_DATE_TO';

export const ADD_FORMAT = 'ADD_FORMAT'
export const REMOVE_FORMAT = 'REMOVE_FORMAT'
export const RESET_FORMAT = 'RESET_FORMAT'

export function requestResults(apiQuery){
  return {
    type: REQUEST_RESULTS,
    apiQuery
  }
}

export function receiveResults(apiQuery, json){
  return {
    type: RECEIVE_RESULTS,
    apiQuery,
    json,
  }
}

export function fetchSearchResults(query) {
  return (dispatch)=>{
    console.log(`http://magda-search-api.terria.io/datasets/search?query=${query}`);
    dispatch(requestResults(query))
    return fetch(`http://magda-search-api.terria.io/datasets/search?query=${query}`)
    .then(response => response.json())
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
    type: ADD_PUBLISHER,
    item: publisher
  }
}

export function removePublisher(publisher){
  return {
    type: REMOVE_PUBLISHER,
    item: publisher
  }
}

export function resetPublisher(){
  return {
    type: RESET_PUBLISHER,
  }
}

export function addFormat(format){
  return {
    type: ADD_FORMAT,
    item: format
  }
}

export function removeFormat(format){
  return {
    type: REMOVE_FORMAT,
    item: format
  }
}

export function resetFormat(){
  return {
    type: RESET_FORMAT,
  }
}

export function addRegion(region){
  return {
    type: ADD_REGION,
    item: region
  }
}

export function resetRegion(){
  return {
    type: RESET_REGION,
  }
}


export function setDateFrom(date){
  return {
    type: SET_DATE_FROM,
    item: date
  }
}

export function setDateTo(date){
  return {
    type: SET_DATE_TO,
    item: date
  }
}

export function resetDateFrom(){
  return {
    type: RESET_DATE_FROM
  }
}

export function resetDateTo(){
  return {
    type: RESET_DATE_TO
  }
}

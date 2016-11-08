import fetch from 'isomorphic-fetch'
export const REQUEST_RESULTS = 'REQUEST_RESULTS'
export const RECEIVE_RESULTS = 'RECEIVE_RESULTS'
export const ADD_PUBLISHER = 'ADD_PUBLISHER'
export const REMOVE_PUBLISHER = 'REMOVE_PUBLISHER'
export const RESET_PUBLISHER = 'RESET_PUBLISHER'
export const ADD_REGION = 'ADD_REGION'
export const RESET_REGION = 'RESET_REGION'

export function requestResults(query){
  return {
    type: REQUEST_RESULTS,
    query
  }
}

export function receiveResults(query, json){
  return {
    type: RECEIVE_RESULTS,
    query,
    json: json,
  }
}

export function fetchSearchResults(query) {
  return (dispatch)=>{
    dispatch(requestResults(query))
    return fetch(`http://magda-search-api.terria.io/datasets/search?query=${query}`)
    .then(response => response.json())
    .then(json =>
      dispatch(receiveResults(query, json))
    )
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

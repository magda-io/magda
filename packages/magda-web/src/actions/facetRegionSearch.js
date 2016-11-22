import getJsonp from '../helpers/getJsonp';
export const REQUEST_REGIONS = 'REQUEST_REGIONS'
export const RECEIVE_REGIONS = 'RECEIVE_REGIONS'

export function requestRegions(query){
  return {
    type: REQUEST_REGIONS,
    query
  }
}

export function receiveRegions(query, json){
  return {
    type: RECEIVE_REGIONS,
    json: json,
    query
  }
}

export function fetchRegionSearchResults(query) {
  return (dispatch)=>{
    dispatch(requestRegions(query))
    return fetch(`http://magda-search-api.terria.io/regions/search?query=${query}`)
    .then(response => response.json())
    .then(json =>
      dispatch(receiveRegions(query, json))
    )
  }
}

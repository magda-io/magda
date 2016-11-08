import fetch from 'isomorphic-fetch'
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
    return getJsonp(`http://www.censusdata.abs.gov.au/census_services/search?query=${query || ' '}&cycle=2011&results=15&type=jsonp&cb=`)
    .then(json =>
      dispatch(receiveRegions(query, json))
    )
  }
}

import fetch from 'isomorphic-fetch'
import config from '../config'
import {actionTypes} from '../constants/ActionTypes';

export function requestFormats(generalQuery, facetQuery){
  return {
    type: actionTypes.REQUEST_FORMATS,
    generalQuery,
    facetQuery
  }
}

export function receiveFormats(generalQuery, facetQuery, json){
  return {
    type: actionTypes.RECEIVE_FORMATS,
    json: json,
    generalQuery,
    facetQuery
  }
}

export function fetchFormatSearchResults(generalQuery, facetQuery) {
  console.log(config().searchApiBaseUrl + `facets/format/options/search?generalQuery=${generalQuery}&facetQuery=${facetQuery}`);
  return (dispatch)=>{
    dispatch(requestFormats(generalQuery, facetQuery))
    return fetch(config().searchApiBaseUrl + `facets/format/options/search?generalQuery=${generalQuery}&facetQuery=${facetQuery}`)
    .then(response => response.json())
    .then(json =>
      dispatch(receiveFormats(generalQuery, facetQuery, json))
    )
  }
}

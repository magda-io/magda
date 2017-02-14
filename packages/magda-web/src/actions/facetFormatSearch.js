// @flow

import fetch from 'isomorphic-fetch'
import {config} from '../config'
import {actionTypes} from '../constants/ActionTypes';

export function requestFormats(generalQuery: string, facetQuery: string):Object {
  return {
    type: actionTypes.REQUEST_FORMATS,
    generalQuery,
    facetQuery
  }
}

export function receiveFormats(generalQuery: string, facetQuery: string, json: Object): Object {
  return {
    type: actionTypes.RECEIVE_FORMATS,
    json: json,
    generalQuery,
    facetQuery
  }
}

export function fetchFormatSearchResults(generalQuery: string, facetQuery: string):Object{
  return (dispatch)=>{
    dispatch(requestFormats(generalQuery, facetQuery))
    console.log(config.searchApiBaseUrl + `facets/format/options/search?generalQuery=${encodeURIComponent(generalQuery)}&facetQuery=${encodeURIComponent(facetQuery)}`);
    return fetch(config.searchApiBaseUrl + `facets/format/options/search?generalQuery=${encodeURIComponent(generalQuery)}&facetQuery=${encodeURIComponent(facetQuery)}`)
    .then(response => response.json())
    .then(json =>
      dispatch(receiveFormats(generalQuery, facetQuery, json))
    )
  }
}

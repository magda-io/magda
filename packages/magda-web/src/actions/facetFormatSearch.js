// @flow

import fetch from 'isomorphic-fetch'
import {config} from '../config'
import {actionTypes} from '../constants/ActionTypes';
import type { Action, FacetSearchJson } from '../types';

export function requestFormats(generalQuery: string, facetQuery: string):Action {
  return {
    type: actionTypes.REQUEST_FORMATS,
    generalQuery,
    facetQuery
  }
}

export function receiveFormats(generalQuery: string, facetQuery: string, json: Object): Action {
  return {
    type: actionTypes.RECEIVE_FORMATS,
    json: json,
    generalQuery,
    facetQuery
  }
}

export function fetchFormatSearchResults(generalQuery: string, facetQuery: string):Object{
  return (dispatch: Function)=>{
    dispatch(requestFormats(generalQuery, facetQuery))
    let url : string = config.searchApiBaseUrl + `facets/format/options/search?generalQuery=${encodeURIComponent(generalQuery)}&facetQuery=${encodeURIComponent(facetQuery)}`
    console.log(url);
    return fetch(url)
    .then(response => response.json())
    .then((json: FacetSearchJson) =>
      dispatch(receiveFormats(generalQuery, facetQuery, json))
    )
  }
}

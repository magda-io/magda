// @flow

import fetch from 'isomorphic-fetch'
import {config} from '../config'
import {actionTypes} from '../constants/ActionTypes';
import type { FacetAction, FacetSearchJson } from '../types';

export function requestFormats(generalQuery: string, facetQuery: string):FacetAction {
  return {
    type: actionTypes.FACET_REQUEST_FORMATS,
    generalQuery,
    facetQuery
  }
}

export function receiveFormats(generalQuery: string, facetQuery: string, json: Object): FacetAction {
  return {
    type: actionTypes.FACET_RECEIVE_FORMATS,
    json: json,
    generalQuery,
    facetQuery
  }
}

export function fetchFormatSearchResults(generalQuery: string, facetQuery: string):Object{
  return (dispatch: Function)=>{
    dispatch(requestFormats(generalQuery, facetQuery))
    let url : string = config.searchApiUrl + `facets/format/options?generalQuery=${encodeURIComponent(generalQuery)}&facetQuery=${encodeURIComponent(facetQuery)}`
    console.log(url);
    return fetch(url)
    .then(response => response.json())
    .then((json: FacetSearchJson) =>
      dispatch(receiveFormats(generalQuery, facetQuery, json))
    )
  }
}

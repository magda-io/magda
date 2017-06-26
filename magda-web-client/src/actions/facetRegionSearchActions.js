// @flow

import fetch from 'isomorphic-fetch'
import {config} from '../config'
import {actionTypes} from '../constants/ActionTypes';
import type { Action, FacetSearchJson } from '../types';

export function requestRegions(facetQuery: string ): Action{
  return {
    type: actionTypes.FACET_REQUEST_REGIONS,
    facetQuery
  }
}

export function receiveRegions(facetQuery: string , json: Object ): Action{
  return {
    type: actionTypes.FACET_RECEIVE_REGIONS,
    json: json,
    facetQuery
  }
}

export function fetchRegionSearchResults(facetQuery: string ) : Store {
  return (dispatch: Dispatch)=>{
    dispatch(requestRegions(facetQuery))
    return fetch(config.searchApiBaseUrl + `/regions/search?query=${facetQuery}`)
    .then(response => response.json())
    .then((json: FacetSearchJson) =>
      dispatch(receiveRegions(facetQuery, json))
    )
  }
}

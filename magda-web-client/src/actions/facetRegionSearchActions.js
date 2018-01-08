// @flow

import fetch from 'isomorphic-fetch'
import {config} from '../config'
import {actionTypes} from '../constants/ActionTypes';
import type { FacetAction, FacetSearchJson } from '../helpers/datasetSearch';

export function requestRegions(facetQuery: string ): FacetAction{
  return {
    type: actionTypes.FACET_REQUEST_REGIONS,
    facetQuery
  }
}

export function receiveRegions(facetQuery: string , json: Object ): FacetAction{
  return {
    type: actionTypes.FACET_RECEIVE_REGIONS,
    json: json,
    facetQuery
  }
}

export function fetchRegionSearchResults(facetQuery: string ) : Store {
  return (dispatch: Dispatch)=>{
    dispatch(requestRegions(facetQuery))
    return fetch(config.searchApiUrl + `regions?query=${facetQuery}`)
    .then(response => response.json())
    .then((json: FacetSearchJson) =>
      dispatch(receiveRegions(facetQuery, json))
    )
  }
}

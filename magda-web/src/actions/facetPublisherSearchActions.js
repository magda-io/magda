// @flow

import fetch from 'isomorphic-fetch'
import {config} from '../config'
import {actionTypes} from '../constants/ActionTypes';
import type { Action, FacetSearchJson } from '../types';

export function requestPublishers(generalQuery:string, facetQuery:string):Action{
  return {
    type: actionTypes.FACET_REQUEST_PUBLISHERS,
    generalQuery,
    facetQuery
  }
}

export function receivePublishers(generalQuery:string, facetQuery:string, json:Object):Action{
  return {
    type: actionTypes.FACET_RECEIVE_PUBLISHERS,
    json: json,
    generalQuery,
    facetQuery
  }
}

export function fetchPublisherSearchResults(generalQuery:string, facetQuery:string) {
  return (dispatch: Function)=>{
    dispatch(requestPublishers(generalQuery, facetQuery))
    return fetch(config.searchApiBaseUrl + `facets/publisher/options?generalQuery=${encodeURIComponent(generalQuery)}&facetQuery=${encodeURIComponent(facetQuery)}`)
    .then(response => response.json())
    .then((json: FacetSearchJson) =>
      dispatch(receivePublishers(generalQuery, facetQuery, json))
    )
  }
}

// @flow

import fetch from 'isomorphic-fetch'
import {config} from '../config'
import {actionTypes} from '../constants/ActionTypes';
import type { FacetAction, FacetSearchJson } from '../helpers/datasetSearch';

export function requestPublishers(generalQuery:string):FacetAction{
  return {
    type: actionTypes.FACET_REQUEST_PUBLISHERS,
    generalQuery,
  }
}

export function requestPublishersFailed(error):FacetAction{
  return {
    type: actionTypes.FACET_REQUEST_PUBLISHERS_FAILED,
    error
  }
}

export function receivePublishers(generalQuery:string, json:Object):FacetAction{
  return {
    type: actionTypes.FACET_RECEIVE_PUBLISHERS,
    json: json,
    generalQuery,
  }
}

export function fetchPublisherSearchResults(generalQuery:string) {
  return (dispatch: Function)=>{
    dispatch(requestPublishers(generalQuery))
    return fetch(config.searchApiUrl + `facets/publisher/options?generalQuery=${encodeURIComponent(generalQuery)}&start=0&limit=10000`)
    .then(response => {
      if (response.status === 200) {return response.json();}
      return dispatch(requestPublishersFailed({title: response.status, detail: response.statusText}))})
    .then((json: FacetSearchJson) =>
      dispatch(receivePublishers(generalQuery, json))
    )
  }
}

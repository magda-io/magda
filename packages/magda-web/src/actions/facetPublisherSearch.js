import fetch from 'isomorphic-fetch'
import config from '../config'
import {actionTypes} from '../constants/ActionTypes';

export function requestPublishers(generalQuery, facetQuery){
  return {
    type: actionTypes.REQUEST_PUBLISHERS,
    generalQuery,
    facetQuery
  }
}

export function receivePublishers(generalQuery, facetQuery, json){
  return {
    type: actionTypes.RECEIVE_PUBLISHERS,
    json: json,
    generalQuery,
    facetQuery
  }
}

export function fetchPublisherSearchResults(generalQuery, facetQuery) {
  return (dispatch)=>{
    dispatch(requestPublishers(generalQuery, facetQuery))
    return fetch(config().searchApiBaseUrl + `facets/publisher/options/search?generalQuery=${encodeURIComponent(generalQuery)}&facetQuery=${encodeURIComponent(facetQuery)}`)
    .then(response => response.json())
    .then(json =>
      dispatch(receivePublishers(generalQuery, facetQuery, json))
    )
  }
}

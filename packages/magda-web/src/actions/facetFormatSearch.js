import fetch from 'isomorphic-fetch'

export const REQUEST_FORMATS = 'REQUEST_FORMATS'
export const RECEIVE_FORMATS = 'RECEIVE_FORMATS'

export function requestFormats(generalQuery, facetQuery){
  return {
    type: REQUEST_FORMATS,
    generalQuery,
    facetQuery
  }
}

export function receiveFormats(generalQuery, facetQuery, json){
  return {
    type: RECEIVE_FORMATS,
    json: json,
    generalQuery,
    facetQuery
  }
}

export function fetchFormatSearchResults(generalQuery, facetQuery) {
  return (dispatch)=>{
    dispatch(requestFormats(generalQuery, facetQuery))
    return fetch(`http://magda-search-api.terria.io/facets/format/options/search?generalQuery=${generalQuery}&facetQuery=${facetQuery}`)
    .then(response => response.json())
    .then(json =>
      dispatch(receiveFormats(generalQuery, facetQuery, json))
    )
  }
}

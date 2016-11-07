export const REQUEST_RESULTS = 'REQUEST_RESULTS'
export const RECEIVE_RESULTS = 'RECEIVE_RESULTS'

export function requestResults(query){
  return {
    type: REQUEST_RESULTS,
    query
  }
}

export function receiveResults(query, json){
  return {
    type: RECEIVE_RESULTS,
    query,
    json: json,
  }
}

export function fetchSearchResults(query) {
  console.log(`http://magda-search-api.terria.io/datasets/search?query=${query}`);
  return (dispatch)=>{
    dispatch(requestResults(query))
    return fetch(`http://magda-search-api.terria.io/datasets/search?query=${query}`)
    .then(response => response.json())
    .then(json =>
      dispatch(receiveResults(query, json))
    )
  }
}

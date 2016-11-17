import getJsonp from '../helpers/getJsonp';
export const REQUEST_REGION_MAPPING = 'REQUEST_REGION_MAPPING'
export const RECEIVE_REGION_MAPPING = 'RECEIVE_REGION_MAPPING'

export function requestRegionMapping(){
  return {
    type: REQUEST_REGION_MAPPING,
  }
}

export function receiveRegionMapping(json){
  return {
    type: RECEIVE_REGION_MAPPING,
    json: json,
  }
}

export function fetchRegionMapping() {
  return (dispatch)=>{
    dispatch(requestRegionMapping())
    return fetch('https://raw.githubusercontent.com/TerriaJS/terriajs/master/wwwroot/data/regionMapping.json')
    .then(response => response.json())
    .then(json =>
      dispatch(receiveRegionMapping(json))
    )
  }
}

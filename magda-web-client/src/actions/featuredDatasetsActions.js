// @flow
import fetch from 'isomorphic-fetch'
import {config} from '../config'
import {actionTypes} from '../constants/ActionTypes';

export function requestDatasets(ids: Array<string>) {
  return {
    type: actionTypes.REQUEST_FEATURED_DATASETS,
    ids
  }
}

export function receiveDatasets(json: Array<Object>) {
  return {
    type: actionTypes.RECEIVE_FEATURED_DATASETS,
    json,
  }
}

export function requestDatasetsError(error: number) {
  return {
    type: actionTypes.REQUEST_FEATURED_DATASETS_ERROR,
    error,
  }
}

export function fetchFeaturedDatasetsFromRegistry(ids: Array<string>):Object{
  return (dispatch: Function, getState: Function)=>{
    if(getState().featuredDatasets.isFetching){
      return false
    }
    dispatch(requestDatasets(ids))
    const fetches = ids.map(id=>fetch(config.registryUrl + `/records/${encodeURIComponent(id)}?aspect=dcat-dataset-strings&optionalAspect=dataset-publisher&optionalAspect=source&dereference=true`).then(response=>response.json()));
    Promise.all(fetches).then(jsons=>dispatch(receiveDatasets(jsons))).catch(error=>dispatch(requestDatasetsError(error)))
  }
}

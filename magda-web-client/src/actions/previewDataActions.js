import {config} from '../config'
import fetch from 'isomorphic-fetch'
import {actionTypes} from '../constants/ActionTypes';
import parser from 'rss-parser'
import papa from 'papaparse';


export function requestPreviewData(){
  return {
    type: actionTypes.REQUEST_DATASET_PREVIEW_DATA,
  }
}

export function receivePreviewData(data: Object) {
  return {
    type: actionTypes.RECEIVE_DATASET_PREVIEW_DATA,
    fetchPreviewData,
    data: data
  }
}

export function requestPreviewDataError(error: number){
  return {
    type: actionTypes.REQUEST_DATASET_PREVIEW_DATA_ERROR,
    error,
  }
}

function getPreviewDataUrl(distributions){
  if(distributions.some(d=>d.format.toLowerCase() === 'csv')){
    const url = distributions.filter(d=>d.format.toLowerCase() === 'csv')[0].downloadURL;
    return url;
  }
}

export function fetchPreviewData(distributions){
  return (dispatch: Function, getState: Function)=>{
      const url = getPreviewDataUrl(distributions);
      // check if we need to fetch
      if(getState().previewData.isFetching || getState().previewData.previewData){
        return false;
      }
      if(!url){
        return false;
      }
      fetch('https://nationalmap.gov.au/proxy/_0d/' + url)
      .then(response=>{
        if (response.status !== 200) {
          dispatch(requestPreviewDataError());
        }
        else {
          return response.text()
        }
      }).then(result=>{
          if(result.error){
            return false
          } else {
            dispatch(receivePreviewData(papa.parse(result, {header: true})))
          }
      });
  }
}

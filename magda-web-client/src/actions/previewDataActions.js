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
    // 1. is csv
    // 2. link status available
    // 3. link is active
    const url = distributions.filter(d=>d.format.toLowerCase() === 'csv' && d.linkStatusAvailable && d.linkActive)[0].downloadURL;
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
      papa.parse("https://nationalmap.gov.au/proxy/_0d/" + url, {
      	download: true,
        header: true,
      	complete: function(data) {
          dispatch(receivePreviewData(data))
      	},
        error: (error)=>{dispatch(requestPreviewDataError(error))}
      });

  }
}

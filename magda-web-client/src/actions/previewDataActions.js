import {config} from '../config'
import fetch from 'isomorphic-fetch'
import {actionTypes} from '../constants/ActionTypes';
import parser from 'rss-parser'
import papa from 'papaparse';
import xmlToTabular from '../helpers/xmlToTabular';


export function requestPreviewData(fileName){
  return {
    type: actionTypes.REQUEST_DATASET_PREVIEW_DATA,
    fileName
  }
}

export function receivePreviewData(data: Object) {
  return {
    type: actionTypes.RECEIVE_DATASET_PREVIEW_DATA,
    fetchPreviewData,
    previewData: data
  }
}

export function requestPreviewDataError(error: number){
  return {
    type: actionTypes.REQUEST_DATASET_PREVIEW_DATA_ERROR,
    error,
  }
}

function getPreviewDataUrl(distributions){
    // 1. link status available
    // 2. link is active
    const viewableDistribution = distributions.filter(d=>d.linkStatusAvailable && d.linkActive && d.downloadURL);
    const csv = viewableDistribution.filter(d=> d.format.toLowerCase() === 'csv');
    if(csv.length > 0){
      return {url: csv[0].downloadURL, format: 'csv'}
    }else{
      const xml = viewableDistribution.filter(d=> d.format.toLowerCase() === 'xml');
      if(xml.length > 0){
        return {url: xml[0].downloadURL, format: 'xml'}
      }
      return false;
    }
    return false;
  }

export function fetchPreviewData(distributions){
  return (dispatch: Function, getState: Function)=>{
      const prop = getPreviewDataUrl(distributions);
      // check if we need to fetch
      if(getState().previewData.isFetching || getState().previewData.previewData){
        return false;
      }
      if(!prop){
        return false;
      }
      const url = prop.url;
      const format = prop.format;

      const fileName =  url.substring(url.lastIndexOf('/')+1);
      dispatch(requestPreviewData(fileName));

      if(format === 'csv'){
        papa.parse("https://nationalmap.gov.au/proxy/_0d/" + url, {
        	download: true,
          header: true,
        	complete: function(data) {
            dispatch(receivePreviewData(data))
        	},
          error: (error)=>{dispatch(requestPreviewDataError(error))}
        });
      }else if(format === 'xml'){
        fetch(url)
        .then(response=>
          {
            if (response.status !== 200) {return dispatch(requestPreviewDataError(response.status))}
            return response.text();
          }
        ).then(xmlData=>{
          if(xmlToTabular(xmlData)){
            dispatch(receivePreviewData(xmlToTabular(xmlData)));
          } else{
            dispatch(requestPreviewDataError('failed to parse xml'))
          }
        })
      }
  }
}

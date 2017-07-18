import {config} from '../config'
import fetch from 'isomorphic-fetch'
import {actionTypes} from '../constants/ActionTypes';
import xmlToTabular from '../helpers/xmlToTabular';
import jsonToTabular from '../helpers/jsonToTabular';
import xlsToTabular from '../helpers/xlsToTabular';
import type {PreviewData} from '../helpers/previewData';

export function requestPreviewData(fileName){
  return {
    type: actionTypes.REQUEST_PREVIEW_DATA,
    fileName
  }
}

export function receivePreviewData(data: PreviewData) {
  return {
    type: actionTypes.RECEIVE_PREVIEW_DATA,
    fetchPreviewData,
    previewData: data
  }
}

export function requestPreviewDataError(error: number){
  return {
    type: actionTypes.REQUEST_PREVIEW_DATA_ERROR,
    error,
  }
}

export function resetPreviewData(){
  return {
    type: actionTypes.RESET_PREVIEW_DATA,
  }
}

function getPreviewDataUrl(distributions){
    // 1. link status available
    // 2. link is active
    const viewableDistribution = distributions.filter(d=>d.linkStatusAvailable && d.linkActive && d.downloadURL);
    const csv = viewableDistribution.filter(d=> d.format.toLowerCase() === 'csv');
    const xml = viewableDistribution.filter(d=> d.format.toLowerCase() === 'xml');
    const json = viewableDistribution.filter(d=> d.format.toLowerCase() === 'json');
    const xls = viewableDistribution.filter(d=> d.format.toLowerCase() === 'xls');
    const excel = viewableDistribution.filter(d=> d.format.toLowerCase() === 'excel');

    if(csv.length > 0){
      return {url: csv[0].downloadURL, format: 'csv'}
    }
    if(xml.length > 0){
      return {url: xml[0].downloadURL, format: 'xml'}
    }
    if(json.length > 0){
      return {url: json[0].downloadURL, format: 'json'}
    }

    if(xls.length > 0){
      return {url: xls[0].downloadURL, format: 'xls'}
    }

    if(excel.length > 0){
      return {url: excel[0].downloadURL, format: 'excel'}
    }

    return false;
  }

export function fetchPreviewData(distributions){
  return (dispatch: Function, getState: Function)=>{
      const prop = getPreviewDataUrl(distributions);
      // check if we need to fetch
      if(getState().previewData.isFetching){
        return false;
      }
      if(!prop){
        return dispatch(resetPreviewData())
      }
      const url = prop.url;
      const format = prop.format;

      const fileName =  url.substring(url.lastIndexOf('/')+1);
      dispatch(requestPreviewData(fileName));

      const proxy = "https://nationalmap.gov.au/proxy/_0d/";

      switch (format) {
        case 'csv':
          xlsToTabular(proxy + url).then(data=>{
            return dispatch(receivePreviewData(data));
          }, error=>{
            return dispatch(requestPreviewDataError('failed to parse xls'));
          });
        case 'xml':
          fetch(proxy + url)
          .then(response=>
            {
              if (response.status !== 200) {return dispatch(requestPreviewDataError(response.status))}
              return response.text();
            }
          ).then(xmlData=>{
            const data = xmlToTabular(xmlData);
            if(data){
              return dispatch(receivePreviewData(data));
            } else{
              return dispatch(requestPreviewDataError('failed to parse xml'))
            }
          });
          break;
        case 'json':
          fetch(proxy + url)
          .then(response=>
            {
              if (response.status !== 200) {return dispatch(requestPreviewDataError(response.status))}
              return response.json();
            }
          ).then(json=>{
            const data = jsonToTabular(json);
            if(data){
              return dispatch(receivePreviewData(data));
            } else{
              return dispatch(requestPreviewDataError('failed to parse json'))
            }
          })
          break;
        case 'xls':
          xlsToTabular(proxy + url).then(data=>{
            return dispatch(receivePreviewData(data));
          }, error=>{
            return dispatch(requestPreviewDataError('failed to parse xls'));
          });
        case 'excel':
          xlsToTabular(proxy + url).then(data=>{
            return dispatch(receivePreviewData(data));
          }, error=>{
            return dispatch(requestPreviewDataError('failed to parse xls'));
          });

        default:
          dispatch(resetPreviewData());
      }
  }
}

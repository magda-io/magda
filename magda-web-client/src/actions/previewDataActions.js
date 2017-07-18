import {config} from '../config'
import fetch from 'isomorphic-fetch'
import {actionTypes} from '../constants/ActionTypes';
import xmlToTabular from '../helpers/xmlToTabular';
import jsonToTabular from '../helpers/jsonToTabular';
import xlsToTabular from '../helpers/xlsToTabular';
import {getPreviewDataUrl} from '../helpers/previewData';
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
        case 'pdf':
            const data = {
              data: proxy + url,
              meta: {
                type: 'pdf'
              }
            }
            return dispatch(receivePreviewData(data));
        default:
          dispatch(resetPreviewData());
      }
  }
}

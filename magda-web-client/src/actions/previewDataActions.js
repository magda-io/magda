import {config} from '../config'
import fetch from 'isomorphic-fetch'
import {actionTypes} from '../constants/ActionTypes';
import xmlToTabular from '../helpers/xmlToTabular';
import jsonToTabular from '../helpers/jsonToTabular';
import papa from 'papaparse';
import {getPreviewDataUrl} from '../helpers/previewData';
import type {PreviewData} from '../helpers/previewData';
import parser from 'rss-parser'


export function requestPreviewData(url: string){
  return {
    type: actionTypes.REQUEST_PREVIEW_DATA,
    url
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

      if(!prop){
        return dispatch(resetPreviewData())
      }

      if(getState().previewData.isFetching && prop.url === getState().previewData.url){
        return false;
      }

      const url = prop.url;
      const format = prop.format;

      dispatch(requestPreviewData(url));

      const proxy = "https://nationalmap.gov.au/proxy/_0d/";

      switch (format) {
        case 'geo':
          const catalog = {"version":"0.0.05","initSources":[{
            "catalog": [
              {
                "name": prop.name,
                "type": "magda-item",
                "url": config.baseUrl,
                "distributionId": prop.id,
                "isEnabled": true
              }
            ]
          }]}

          const d = {
            data: window.location.origin + "/preview-map/#start=" + encodeURIComponent(JSON.stringify(catalog)),
            meta: {
              type: "geo"
            }
          }
          dispatch(receivePreviewData(d));
          break;

        case 'csv':
        papa.parse("https://nationalmap.gov.au/proxy/_0d/" + url, {
          download: true,
          header: true,
          complete: function(data) {
            data.meta.type = 'tabular';
            dispatch(receivePreviewData(data))
          },
          error: (error)=>{dispatch(requestPreviewDataError(error))}
        });
          break;
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
              dispatch(receivePreviewData(data));
            } else{
              dispatch(requestPreviewDataError('failed to parse xml'))
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
              dispatch(receivePreviewData(data));
            } else{
              dispatch(requestPreviewDataError('failed to parse json'))
            }
          })
          break;

        case 'txt':
          fetch(proxy + url)
          .then(response=>
            {
              if (response.status !== 200) {return dispatch(requestPreviewDataError(response.status))}
              return response.text();
            }
          ).then(text=>{
            dispatch(receivePreviewData({
              data: text,
              meta: {
                type: 'txt'
              }
            }));
          })
          break;
        case 'html':
            dispatch(receivePreviewData({
              data: url,
              meta: {
                type: 'html'
              }
            }));
            break;
        case 'googleViewable':
            dispatch(receivePreviewData({
              data: url,
              meta: {
                type: 'googleViewable'
              }
            }));
            break;
        case 'rss':
            fetch(proxy + url)
            .then(response=>{
              if (response.status !== 200) {
                return dispatch(requestPreviewDataError(response.status));
              }
              else {
                return response.text()
              }
            }).then(text=>{
              parser.parseString(text, (err, result)=>{
                if(err){
                  dispatch(requestPreviewDataError("error getting rss feed"));
                  console.warn(err);
                } else {
                  dispatch(receivePreviewData({
                    data: result.feed.entries,
                    meta: {
                      type: 'rss'
                    }
                  }))
                }
            });
          })
            break;
        default:
          dispatch(resetPreviewData());
      }
  }
}

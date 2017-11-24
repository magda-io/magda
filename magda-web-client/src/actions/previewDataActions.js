import {config} from '../config'
import fetch from 'isomorphic-fetch'
import {actionTypes} from '../constants/ActionTypes';
import {getPreviewDataUrl} from '../helpers/previewData';
import type {PreviewData} from '../helpers/previewData';



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

export function requestPreviewDataError(error: string){
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


function loadPapa(){
  return import(/* webpackChunkName: "papa" */ 'papaparse').then(papa => {
     return papa;
   }).catch(error => 'An error occurred while loading the component');

}


function loadXmlParser(){
  return import(/* webpackChunkName: "xmltoTabular" */ '../helpers/xmlToTabular').then(xmlToTabular => {
     return xmlToTabular;
   }).catch(error => 'An error occurred while loading the component');
}

function loadRssParser(){
  return import(/* webpackChunkName: "rssParser" */ 'rss-parser').then(rssParser => {
     return rssParser;
   }).catch(error => 'An error occurred while loading the component');
}



export function fetchPreviewData(distribution){
  return (dispatch: Function, getState: Function)=>{
      const prop = getPreviewDataUrl(distribution);
      // check if we need to fetch

      if(!prop){
        return dispatch(requestPreviewDataError("No preview available because the url to access the data is broken"));
      }

      if(getState().previewData.isFetching && prop.url === getState().previewData.url){
        return false;
      }

      const url = prop.url;
      const format = prop.format;

      dispatch(requestPreviewData(url));

      const proxy = config.proxyUrl;

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

          let geoData = {
            data: config.previewMapUrl + "#start=" + encodeURIComponent(JSON.stringify(catalog)),
            meta: {
              type: "geo"
            }
          }
          dispatch(receivePreviewData({[distribution.identifier]: geoData}));
          break;

        case 'csv':
        loadPapa().then(papa=>{
          papa.parse(proxy + "_0d/" + url, {
            download: true,
            header: true,
            skipEmptyLines: true,
            complete: function(data) {
              data.meta.type = distribution.isTimeSeries ? 'chart' : 'tabular';
              data.meta.chartFields = distribution.chartFields;

              dispatch(receivePreviewData({[distribution.identifier]: data}))
            },
            error: (error)=>{dispatch(requestPreviewDataError(error))}
          });
        })

        break;
        case 'xml':
          fetch(proxy + url)
          .then(response=>
            {
              if (response.status !== 200) {return dispatch(requestPreviewDataError({title: response.status, detail: response.statusText}))}
              return response.text();
            }
          ).then(xmlData=>{
            loadXmlParser().then(xmlToTabular => {
              const data = xmlToTabular.default(xmlData);
              if(data){
                dispatch(receivePreviewData(data));
              } else{
                dispatch(requestPreviewDataError('failed to parse xml'))
              }
            })
          });
          break;
        case 'json':
          fetch(proxy + url)
          .then(response=>
            {
              if (response.status !== 200) {return dispatch(requestPreviewDataError({title: response.status, detail: response.statusText}))}
              return response.json();
            }
          ).then(json=>{
            const jsonData = {
              data: json,
              meta: {
                type: 'json'
              }
            }
            if(!json.error){
              dispatch(receivePreviewData({[distribution.identifier]: jsonData}));
            } else{
              dispatch(requestPreviewDataError('failed to parse json'))
            }
          })
          break;

        case 'txt':
          fetch(proxy + url)
          .then(response=>
            {
              if (response.status !== 200) {return dispatch(requestPreviewDataError({title: response.status, detail: response.statusText}))}
              return response.text();
            }
          ).then(text=>{
            const textData = {
              data: text,
              meta: {
                type: 'txt'
              }
            }
            dispatch(receivePreviewData({[distribution.identifier]: textData}));
          })
          break;
        case 'html':
            const htmlData = {
              data: url,
              meta: {
                type: 'html'
              }
            }
            dispatch(receivePreviewData({[distribution.identifier]: htmlData}));
            break;
        case 'googleViewable':
            const googleViewableData = {
              data: url,
              meta: {
                type: 'googleViewable'
              }
            }
            dispatch(receivePreviewData({[distribution.identifier]: googleViewableData}));
            break;
        case 'impossible':
            const impossibleData = {
              data: url,
              meta: {
                type: 'impossible'
              }
            }
            dispatch(receivePreviewData({[distribution.identifier]: impossibleData}));
            break;
        case 'rss':
            fetch(proxy + url)
            .then(response=>{
              if (response.status !== 200) {
                return dispatch(requestPreviewDataError({title: response.status, detail: response.statusText}));
              }
              else {
                return response.text()
              }
            }).then(text=>{
              loadRssParser().then(rssParser=> {
                rssParser.parseString(text, (err, result)=>{
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
          })
            break;
        default:
          return dispatch(receivePreviewData({[distribution.identifier]: null}));
      }
  }
}

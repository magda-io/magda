import {config} from '../config'
import fetch from 'isomorphic-fetch'
import {actionTypes} from '../constants/ActionTypes';
import type { Action } from '../types';
import parser from 'rss-parser'


export function requestPreviewData():Action {
  return {
    type: actionTypes.REQUEST_NEWS,
  }
}

export function receivePreviewData(news: Object): Action {
  return {
    type: actionTypes.RECEIVE_NEWS,
    news,
  }
}

export function requestPreviewDataError(error: number): Action {
  return {
    type: actionTypes.REQUEST_NEWS_ERROR,
    error,
  }
}



export function fetchPreviewData(){
  return (dispatch: Function, getState: Function)=>{
      // check if we need to fetch
      if(getState().news.isFetching || getState().news.news.length > 0){
        return false;
      }
      const url = config.rssUrl;
      fetch(url)
      .then(response=>{
        if (response.status !== 200) {
          dispatch(requestPreviewDataError());
        }
        else {
          return response.text()
        }
      }).then(result=>{
          if(result.error;){
            return false
          } else {
            dispatch(receivePreviewData(result.feed.entries))
          }
      });
  }
}

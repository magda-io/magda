import {config} from '../config'
import fetch from 'isomorphic-fetch'
import {actionTypes} from '../constants/ActionTypes';
import type { Action } from '../types';
import parser from 'rss-parser'


export function requestNews():Action {
  return {
    type: actionTypes.REQUEST_NEWS,
  }
}

export function receiveNews(news: Object): Action {
  return {
    type: actionTypes.RECEIVE_NEWS,
    news,
  }
}

export function requestNewsError(error: number): Action {
  return {
    type: actionTypes.REQUEST_NEWS_ERROR,
    error,
  }
}



export function fetchNewsfromRss(){
  return (dispatch: Function, getState: Function)=>{
      // check if we need to fetch
      if(getState().news.isFetching || getState().news.news.length > 0){
        return false;
      }
      const url = config.rssUrl;
      fetch(url)
      .then(response=>{
        if (response.status !== 200) {
          return dispatch(requestNewsError(response.status));
        }
        else {
          return response.text()
        }
      }).then(text=>{
        parser.parseString(text, (err, result)=>{
          if(err){
            dispatch(requestNewsError());
          } else {
            dispatch(receiveNews(result.feed.entries))
          }
        })
      });
  }
}

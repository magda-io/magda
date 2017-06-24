// @flow

import fetch from 'isomorphic-fetch'
import {config} from '../config'
import {actionTypes} from '../constants/ActionTypes';
import type { Action } from '../types';

export function requestPublishers():Action {
  return {
    type: actionTypes.REQUEST_PUBLISHERS,
  }
}

export function receivePublishers(json: Object): Action {
  return {
    type: actionTypes.RECEIVE_PUBLISHERS,
    json,
  }
}

export function requestPublishersError(error: number): Action {
  return {
    type: actionTypes.REQUEST_PUBLISHERS_ERROR,
    error,
  }
}

export function requestPublisher():Action {
  return {
    type: actionTypes.REQUEST_PUBLISHER,
  }
}

export function receivePublisher(json: Object): Action {
  return {
    type: actionTypes.RECEIVE_PUBLISHER,
    json,
  }
}

export function requestPublisherError(error: number): Action {
  return {
    type: actionTypes.REQUEST_PUBLISHER_ERROR,
    error,
  }
}

function fetchPublishers(start){
    return (dispatch: Function) => {
        dispatch(requestPublishers());
        const url = `${config.registryUrl}?aspect=organization-details&limit=${config.resultsPerPage}&start=${(start-1)*config.resultsPerPage}`;
        return fetch(url)
            .then(response => {
                if (response.status === 200) {
                    return response.json();
                }
                return dispatch(requestPublishersError(response.status))
            })
            .then(json => {
                if(!json.error){
                    return dispatch(receivePublishers(json));
                }
            })
    }
}

function shouldFetchPublishers(state){
    const publisher = state.publisher;
    if(publisher.isFetchingPublishers){
        return false;
    }
    return true;
}


export function fetchPublishersIfNeeded(start: number):Object{
  return (dispatch: Function, getState: Function)=>{
      if(shouldFetchPublishers(getState())){
          return dispatch(fetchPublishers(start))
      } else{
          return Promise.resolve();
      }
  }
}


function fetchPublisher(id){
    return (dispatch: Function) => {
        dispatch(requestPublisher());
        const url = `${config.registryUrl}/${id}?aspect=organization-details`;
        console.log(url);
        return fetch(url)
            .then(response => {
                if (response.status === 200) {
                    return response.json()
                }
                return dispatch(requestPublisherError(response.status))
            })
            .then(json => {
                if(!json.error){
                    return dispatch(receivePublisher(json));
                }
            })
    }
}

function shouldFetchPublisher(state){
    const publisher = state.publisher;
    if(publisher.isFetchingPublisher){
        return false;
    }
    return true;
}


export function fetchPublisherIfNeeded(id: number):Object{
  return (dispatch: Function, getState: Function)=>{
      if(shouldFetchPublisher(getState())){
          return dispatch(fetchPublisher(id))
      } else{
          return Promise.resolve();
      }
  }
}

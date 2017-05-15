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

function fetchPublishers(start){
    return (dispatch: Function) => {
        dispatch(requestPublishers());
        const url = `http://data.gov.au/api/3/action/organization_list?all_fields=true&limit=${config.resultsPerPage}&offset=${(start-1)*config.resultsPerPage}`;
        console.log(url);
        return fetch(url)
            .then(response => {
                if (response.status >= 400) {
                if(response.status === 404){
                    return dispatch(requestPublishersError(404));
                }
                    return dispatch(requestPublishersError(response.status));
                } 
                return response.json();
            })
            .then((json) => dispatch(receivePublishers(json))
            )
    }
}

function shouldFetchPublishers(state){
    const publisher = state.publisher;
    if(publisher.isFetching){
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


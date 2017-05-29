// @flow

import fetch from 'isomorphic-fetch'
import {config} from '../config'
import {actionTypes} from '../constants/ActionTypes';
import type { Action } from '../types';

export function requestProjects():Action {
  return {
    type: actionTypes.REQUEST_PROJECTS,
  }
}

export function receiveProjects(json: Object): Action {
  return {
    type: actionTypes.RECEIVE_PROJECTS,
    json,
  }
}

export function requestProjectsError(error: number): Action {
  return {
    type: actionTypes.REQUEST_PROJECTS_ERROR,
    error,
  }
}


export function fetchProjectsFromRegistry():Object{
  return (dispatch: Function)=>{
    dispatch(requestProjects())
    let url : string = config.registryUrl + "?aspect=dcat-dataset-strings";
    return fetch(url)
    .then(response => {
        if (response.status >= 400) {
            return dispatch(requestProjectsError(response.status));
        }
        return response.json();
    })
    .then((json) => dispatch(receiveProjects(json))
    )
  }
}


export function fetchProjectsIfNeeded(){
  return (dispatch: Function, getState: Function)=>{
    if(!getState().project.isFetching){
          return dispatch(fetchProjectsFromRegistry())
      } else{
          return Promise.resolve();
      }
  }
}

// @flow

import fetch from 'isomorphic-fetch'
import {config} from '../config'
import {actionTypes} from '../constants/ActionTypes';
import type { Action, JsonData } from '../types';



export function requestRegionMapping(): Action{
  return {
    type: actionTypes.REQUEST_REGION_MAPPING,
  }
}

export function receiveRegionMapping(json: Object): Action{
  return {
    type: actionTypes.RECEIVE_REGION_MAPPING,
    json: json,
  }
}

export function fetchRegionMapping() {
  return (dispatch: Function)=>{
    dispatch(requestRegionMapping())
    return fetch(config.searchApiBaseUrl + 'region-types')
    .then(response => response.json())
    .then((json: JsonData) =>
      dispatch(receiveRegionMapping(json))
    )
  }
}

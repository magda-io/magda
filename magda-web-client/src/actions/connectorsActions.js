// @flow

import fetch from 'isomorphic-fetch'
import {config} from '../config'
import {actionTypes} from '../constants/ActionTypes';
import type { Dispatch, GetState } from '../types';
import {browserHistory} from 'react-router';


export type ConnectorProps = {
  type: string,
  name: string,
  sourceUrl: string,
  schedule: string,
  id: string
}


export function requestConnectors() {
  return {
    type: actionTypes.REQUEST_CONNECTORS,
  }
}

export function receiveConnectors(json: ConnectorProps ) {
  return {
    type: actionTypes.RECEIVE_CONNECTORS,
    json,
  }
}

export function requestConnectorsError(error: number) {
  return {
    type: actionTypes.REQUEST_CONNECTORS_ERROR,
    error,
  }
}

export function updateConnector(){
  return {
    type: actionTypes.UPDATE_CONNECTOR
  }
}

export function updateConnectorSuccess(json){
  return {
    type: actionTypes.UPDATE_CONNECTOR_SUCCESS,
    json
  }
}

export function updateConnectorFailure(){
  return {
    type: actionTypes.UPDATE_CONNECTOR_FAILURE
  }
}



export function updateConnectorStatus(connector){
  return (dispatch: Dispatch) => {
    dispatch(updateConnector());
    const url = `${config.registryApiUrl}records/${connector.id}/aspects/connector`;
    const body = [{ "op": "replace", "path": "/status", "value": connector.status === 'open' ? 'closed' : 'open' }]
      return fetch(url,
      {
        method: 'PATCH',
        body: JSON.stringify(body),
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        credentials: "include"
      })
      .then(response => {
        if(response.status === 200){
          return response.json()
        }
        return dispatch(updateConnectorFailure(response.status))
      })
      .then((result)=>{
        if(result.error){
          return false;
        }
        dispatch(updateConnectorSuccess(result))
      })
  }
}

export function fetchConnectorsFromRegistry(start: number):Object{
  return (dispatch: Dispatch)=>{
    dispatch(requestConnectors())
    let url : string = `${config.adminApiUrl}connectors/`;
    console.log(url);
    return fetch(url, {
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      credentials: "include"
    })
    .then(response => {
        if (response.status >= 400) {
            return dispatch(requestConnectorsError(response.status));
        }
        return response.json();
    })
    .then((json: Object) => {if(!json.error){dispatch(receiveConnectors(json))}
    })
  }
}


export function fetchConnectorsIfNeeded(start: number){
  return (dispatch: Dispatch, getState: GetState)=>{
    if(!getState().connectors.isFetching){
          return dispatch(fetchConnectorsFromRegistry(start))
      } else{
          return Promise.resolve();
      }
  }
}

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



export function updateConnectorStatus(connectorId: string, action: string){
  return (dispatch: Dispatch) => {
    dispatch(updateConnector());
    const url = `${config.adminApiUrl}connectors/${connectorId}/${action}`;
      return fetch(url,
      {
        method: 'POST',
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
        dispatch(fetchConnectorsIfNeeded())

      })
  }
}


export function deleteConnector(connectorId: string){
  return (dispatch: Dispatch) => {
    dispatch(updateConnector());
    const url = `${config.adminApiUrl}connectors/${connectorId}/`;
      return fetch(url,
      {
        method: 'DELETE',
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
        dispatch(fetchConnectorsIfNeeded())

      })
  }
}

export function fetchConnectorsFromRegistry():Object{
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


export function fetchConnectorsIfNeeded(){
  return (dispatch: Dispatch, getState: GetState)=>{
    if(!getState().connectors.isFetching){
          return dispatch(fetchConnectorsFromRegistry())
      } else{
          return Promise.resolve();
      }
  }
}

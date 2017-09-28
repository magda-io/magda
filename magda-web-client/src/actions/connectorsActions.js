// @flow

import fetch from 'isomorphic-fetch'
import {config} from '../config'
import {actionTypes} from '../constants/ActionTypes';
import type { Dispatch, GetState } from '../types';


export type ConnectorProps = {
  type: string,
  name: string,
  sourceUrl: ?string,
  schedule: ?string,
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

export function createConnector(){
  return {
    type: actionTypes.CREATE_CONNECTOR
  }
}

export function createConnectorSuccess(json){
  return {
    type: actionTypes.CREATE_CONNECTOR_SUCCESS,
    json
  }
}

export function createConnectorError(error: string){
  return {
    type: actionTypes.CREATE_CONNECTOR_ERROR,
    error
  }
}

export function resetCreateConnector(){
  return{
    type: actionTypes.RESET_CREATE_CONNECTOR,
  }
}

export function resetConnectorForm(){
  return (dispatch: Dispatch)=>{
    return dispatch(resetCreateConnector());
  }
}


export function validateConnectorName(name){
  return (dispatch: Dispatch)=>{
    if(!name || name.length === 0){
      return dispatch(createConnectorError("name field cannot be empty"));
    }
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
            return dispatch(createConnectorError(response.status));
        }
        return response.json();
    })
    .then((json: Object) => {
      if(!json.error){
        //successfully get the current conenctors
        dispatch(receiveConnectors(json))
        if(json.some(item => item.id === encodeURI(name))){
          // illegal user name, dispatch error
          return dispatch(createConnectorError("connector name already exists"));
        }
      }
    })
  }
}

export function validateConnectorType(type){
  return (dispatch: Dispatch)=>{
    if(!type || type.length ===0){
      return dispatch(createConnectorError("type name cannot be empty"));
    }
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


export function createNewConnector(connectorProps: ConnectorProps){
  return (dispatch: Dispatch) => {
    dispatch(createConnector());
    const url = `${config.adminApiUrl}connectors/${connectorProps.id}`;
      return fetch(url,
      {
        method: 'PUT',
        body: JSON.stringify(connectorProps),
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
        return dispatch(createConnectorError(response.status))
      })
      .then((result)=>{
        if(result.error){
          return false;
        }
        dispatch(createConnectorSuccess(result))
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

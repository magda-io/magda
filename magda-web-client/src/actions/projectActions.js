// @flow

import fetch from 'isomorphic-fetch'
import {config} from '../config'
import {actionTypes} from '../constants/ActionTypes';
import {validateProjectName, validateProjectDescription, Dispatch, GetState} from '../helpers/validateInput';
import type { ProjectAction, Project,  } from '../types';
import {browserHistory} from 'react-router';

export function requestProjects():ProjectAction {
  return {
    type: actionTypes.REQUEST_PROJECTS,
  }
}

export function receiveProjects(json: Object): ProjectAction {
  return {
    type: actionTypes.RECEIVE_PROJECTS,
    json,
  }
}

export function requestProjectsError(error: number): ProjectAction {
  return {
    type: actionTypes.REQUEST_PROJECTS_ERROR,
    error,
  }
}


export function requestProject():ProjectAction {
  return {
    type: actionTypes.REQUEST_PROJECT,
  }
}

export function receiveProject(json: Object): ProjectAction {
  return {
    type: actionTypes.RECEIVE_PROJECT,
    json,
  }
}

export function requestProjectError(error: number): ProjectAction {
  return {
    type: actionTypes.REQUEST_PROJECT_ERROR,
    error,
  }
}

export function validateProjectFields(props: Project): ProjectAction {
  return {
    type: actionTypes.VALIDATE_PROJECT_FIELDS,
  };
}

export function validateProjectFieldsFailure(fieldErrors: Project): ProjectAction {
  return {
    type: actionTypes.VALIDATE_PROJECT_FIELDS_FAILURE,
    fieldErrors
  };
}

export function resetProjectFields(): ProjectAction  {
  return {
    type: actionTypes.RESET_PROJECT_FIELDS
  }
};

export function createProject(newProject: Project): ProjectAction  {
  return {
    type: actionTypes.CREATE_PROJECT,
    newProject
  };
}

export function createProjectSuccess(newProject: Project, showNotification: boolean): ProjectAction  {
  return {
    type: actionTypes.CREATE_PROJECT_SUCCESS,
    newProject,
    showNotification
  };
}

export function createProjectFailure(error: number): ProjectAction {
  return {
    type: actionTypes.CREATE_PROJECT_FAILURE,
    error
  };
}


export function postNewProject(props: Project){
  return (dispatch: Dispatch) => {
    dispatch(createProject(props));
    const url = config.registryUrl + '/records';
    console.log(props);

    return fetch(url,
    {
      method: 'POST',
      body: JSON.stringify(props),
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
      return dispatch(createProjectFailure(response.status))
    })
    .then((result: Project )=> {
      if(result.error){
        return false;
      }
      // should change into browserHistory?
      browserHistory.push(`/projects/${encodeURIComponent(props.id)}`);
      dispatch(createProjectSuccess(result, true))
      setTimeout(function(){ dispatch(createProjectSuccess(result, false))}, 5000);
    });

  }
}



export function validateFields(props: Project){
  return (dispatch: Dispatch) =>{
    dispatch(validateProjectFields(props));
    const nameError = validateProjectName(props.get('name'));
    const descriptionError = validateProjectDescription(props.getIn(['aspects', 'project', 'description']));
    if( !nameError && !descriptionError){
      dispatch(postNewProject(props.toJS()));
    } else {
      dispatch(validateProjectFieldsFailure(
        Object.assign({}, props, {
          name: nameError,
          description: descriptionError
        })
      ))
    }
  }
}


export function fetchProjectsFromRegistry(start: number):Object{
  return (dispatch: Dispatch)=>{
    dispatch(requestProjects())
    let url : string = `${config.registryUrl}/records?aspect=project&limit=${config.resultsPerPage}&start=${(start-1)*config.resultsPerPage}`;
    console.log(url);
    return fetch(url)
    .then(response => {
        if (response.status >= 400) {
            return dispatch(requestProjectsError(response.status));
        }
        return response.json();
    })
    .then((json: Object) => dispatch(receiveProjects(json))
    )
  }
}


export function fetchProjectsIfNeeded(start: number){
  return (dispatch: Dispatch, getState: GetState)=>{
    if(!getState().project.isFetching){
          return dispatch(fetchProjectsFromRegistry(start))
      } else{
          return Promise.resolve();
      }
  }
}


export function fetchProjectFromRegistry(projectId: string):Object{
  return (dispatch: Dispatch)=>{
    dispatch(requestProject())
    let url : string = config.registryUrl + '/records/' + projectId + '?aspect=project';
    return fetch(url)
    .then(response => {
        if (response.status >= 400) {
            return dispatch(requestProjectError(response.status));
        }
        return response.json();
    })
    .then((json: Object) => dispatch(receiveProject(json))
    )
  }
}


export function fetchProjectIfNeeded(projectId: string){
  return (dispatch: Dispatch, getState: GetState)=>{
    if(!getState().project.isFetching){
          return dispatch(fetchProjectFromRegistry(projectId))
      } else{
          return Promise.resolve();
      }
  }
}

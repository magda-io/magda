// @flow
import {parseProject} from '../helpers/project';
import type {ProjectAction, ParsedProject, RawProject, RawProjects, ProjectProps } from '../helpers/project';


const noFieldError: ProjectProps = {
  name: null,
  description: null,
  id: ''
}

const initialData = {
    isFetching: false,
    projects: [],
    project: parseProject(),
    error: null,
    notFound:  false,
    hitCount: 0,
    fieldErrors: noFieldError,
    showNotification: false
}


type ProjectsResult = {
  isFetching : boolean,
  projects: Array<ParsedProject>,
  project: ?ParsedProject,
  error: ?number,
  hitCount: number,
  fieldErrors: ProjectProps,
  showNotification?: boolean
}


const projects = (state: ProjectsResult = initialData, action: ProjectAction) => {
  switch (action.type) {
    case 'REQUEST_PROJECTS':
      return Object.assign({}, state, {
        isFetching: true,
        error: null
      })
    case 'RECEIVE_PROJECTS':
      return Object.assign({}, state, {
        isFetching: false,
        projects: action.json && action.json.records && action.json.records.map(r=>parseProject(r)),
        hitCount: action.json && action.json.totalCount
      })
    case 'REQUEST_PROJECTS_ERROR':
      return Object.assign({}, state, {
        isFetching: false,
        error: action.error,
      })
    case 'REQUEST_PROJECT':
      return Object.assign({}, state, {
        isFetching: true,
        error: null
      })
    case 'RECEIVE_PROJECT':
      return Object.assign({}, state, {
        isFetching: false,
        project: action.json  && parseProject(action.json),
        error: null
      })
    case 'REQUEST_PROJECT_ERROR':
      return Object.assign({}, state, {
        isFetching: false,
        error: action.error,
      })
    case 'CREATE_PROJECT':
    	return Object.assign({}, state, {
        isFetching: false,
        error: null,
      })
    case 'CREATE_PROJECT_SUCCESS':
      return Object.assign({}, state, {
        isFetching: false,
        error: null,
        project: action.json && parseProject(action.json),
        showNotification: action.showNotification
      })
    case 'CREATE_PROJECT_FAILURE':
      return Object.assign({}, state, {
        isFetching: false,
        error: action.error,
      })
    case 'RESET_PROJECT_FIELDS':
      return Object.assign({}, state, {
        isFetching: false,
        error: null,
        project: undefined
      })
    case 'VALIDATE_PROJECT_FIELDS':
      return Object.assign({}, state, {
        isFetching: true,
        error: null,
        fieldErrors: noFieldError
      })
    case 'VALIDATE_PROJECT_FIELDS_FAILURE':
      return Object.assign({}, state, {
        isFetching: false,
        error: null,
        fieldErrors: action.fieldErrors
      })
    case 'UPDATE_PROJECT':
      return Object.assign({}, state, {
        error: null,
      })
    case 'UPDATE_PROJECT_SUCCESS':
      const newProject = Object.assign({}, state.project, action.json)
      return Object.assign({}, state, {
        isFetching: false,
        error: null,
        project: newProject,
      })
    case 'UPDATE_PROJECT_FAILURE':
      return Object.assign({}, state, {
        isFetching: false,
        error: action.error
      })
    default:
      return state
  }
};
export default projects;

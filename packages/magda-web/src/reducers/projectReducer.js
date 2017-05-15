// @flow 
import {parseProject} from '../helpers/api';

const initialData = {
    isFetching: false,
    projects: [],
    error: undefined,
    notFound:  false,
    hitCount: 0
}


type ProjectsResult = {
  isFetching : boolean,
  projects: Array<Object>,
  error: any,
  notFound: boolean,
  hitCount: number 
}

type recordAction = {
  json: Object,
  error: boolean,
  type: boolean
}

const projects = (state: ProjectsResult = initialData, action: recordAction) => {
  switch (action.type) {
    case 'REQUEST_PROJECTS':
      return Object.assign({}, state, {
        isFetching: true
      })
    case 'RECEIVE_PROJECTS':
      return Object.assign({}, state, {
        isFetching: false,
        projects: action.json && action.json.records && action.json.records.map(r=>parseProject(r)),
        hitCount: action.json.totalCount
      })
    case 'REQUEST_PROJECTS_ERROR':
      return Object.assign({}, state, {
        isFetching: false,
        error: action.error,
      })
    case 'PROJECTS_NOT_FOUND':
      return Object.assign({}, state, {
        isFetching: false,
        notFound:  true
      })
    default:
      return state
  }
};
export default projects;

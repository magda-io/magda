// @flow 
import type { Action, Dataset } from '../types';

const initialData = {
    isFetching: false,
    data: {},
    error: undefined,
    notFound:  false
}

const dataset = (state: Dataset =initialData, action: Action) => {
  switch (action.type) {
    case 'REQUEST_DATASET':
      return Object.assign({}, state, {
        isFetching: true
      })
    case 'RECEIVE_DATASET':
      return Object.assign({}, state, {
        isFetching: false,
        data: action.json && action.json,
      })
    case 'REQUEST_DATASET_ERROR':
      return Object.assign({}, state, {
        isFetching: false,
        error:  action.error,
      })
    case 'RECEIVE_DATASET':
      return Object.assign({}, state, {
        isFetching: false,
        notFound:  true
      })
    default:
      return state
  }
};
export default dataset;

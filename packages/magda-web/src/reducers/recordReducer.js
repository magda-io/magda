// @flow 
import {parseDataset, parseDistribution} from '../helpers/record';

const initialData = {
    isFetching: false,
    dataset: {},
    distribution: {},
    error: undefined,
    notFound:  false
}


type RecordResult = {
  isFetching : boolean,
  dataset: Object,
  distribution: Object,
  error: any,
  notFound: boolean
}

type recordAction = {
  json: Object,
  error: boolean,
  type: boolean
}

const record = (state: RecordResult = initialData, action: recordAction) => {
  switch (action.type) {
    case 'REQUEST_DATASET':
      return Object.assign({}, state, {
        isFetching: true
      })
    case 'RECEIVE_DATASET':
      return Object.assign({}, state, {
        isFetching: false,
        dataset: action.json && parseDataset(action.json),
      })
    case 'REQUEST_DATASET_ERROR':
      return Object.assign({}, state, {
        isFetching: false,
        error: action.error,
      })
    case 'DATASET_NOT_FOUND':
      return Object.assign({}, state, {
        isFetching: false,
        notFound:  true
      })
      case 'REQUEST_DISTRIBUTION':
      return Object.assign({}, state, {
        isFetching: true
      })
    case 'RECEIVE_DISTRIBUTION':
      return Object.assign({}, state, {
        isFetching: false,
        distribution: action.json && parseDistribution(action.json),
      })
    case 'REQUEST_DISTRIBUTION_ERROR':
      return Object.assign({}, state, {
        isFetching: false,
        error: action.error,
      })
    case 'DISTRIBUTION_NOT_FOUND':
      return Object.assign({}, state, {
        isFetching: false,
        notFound:  true
      })
    default:
      return state
  }
};
export default record;

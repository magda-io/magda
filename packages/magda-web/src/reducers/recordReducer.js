// @flow 
import {parseRecord} from '../helpers/record';

const initialData = {
    isFetching: false,
    data: {},
    error: undefined,
    notFound:  false
}


type RecordResult = {
  isFetching : boolean,
  data: Object,
  error: any,
  notFound: boolean
}

type recordAction = {
  json: Object,
  error: boolean,
  type: boolean
}

const dataset = (state: RecordResult = initialData, action: recordAction) => {
  switch (action.type) {
    case 'REQUEST_RECORD':
      return Object.assign({}, state, {
        isFetching: true
      })
    case 'RECEIVE_RECORD':
      return Object.assign({}, state, {
        isFetching: false,
        data: action.json && parseRecord(action.json),
      })
    case 'REQUEST_RECORD_ERROR':
      return Object.assign({}, state, {
        isFetching: false,
        error: action.error,
      })
    case 'RECORD_NOT_FOUND':
      return Object.assign({}, state, {
        isFetching: false,
        notFound:  true
      })
    default:
      return state
  }
};
export default dataset;

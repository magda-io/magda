// @flow
import {parsePublisher} from '../helpers/publisher';

const initialData = {
    isFetchingPublishers: false,
    isFetchingPublisher: false,
    publishers: [],
    publisher: {},
    hitCount: 0,
    errorFetchingPublishers: undefined,
    errorFetchingPublisher: undefined,
}


type PublishersResult = {
  isFetchingPublishers : boolean,
  isFetchingPublisher : boolean,
  publishers: Array<Object>,
  publisher: Object,
  hitCount: number,
  errorFetchingPublishers: any,
  errorFetchingPublisher: any,
}

type recordAction = {
  json: Object,
  error: any,
  type: boolean
}

const publisher = (state: PublishersResult = initialData, action: recordAction) => {
  switch (action.type) {
    case 'REQUEST_PUBLISHERS':
      return Object.assign({}, state, {
        isFetchingPublishers: true
      })
    case 'RECEIVE_PUBLISHERS':
      return Object.assign({}, state, {
        isFetchingPublishers: false,
        publishers: action.json && action.json.records &&  action.json.records.map(r=>parsePublisher(r)),
        hitCount: action.json && 515,
      })
    case 'REQUEST_PUBLISHERS_ERROR':
      return Object.assign({}, state, {
        isFetchingPublishers: false,
        errorFetchingPublishers: action.error,
      })
    case 'REQUEST_PUBLISHER':
      return Object.assign({}, state, {
        isFetchingPublisher: true
      })
    case 'RECEIVE_PUBLISHER':
      return Object.assign({}, state, {
        isFetchingPublisher: false,
        publisher: action.json &&  parsePublisher(action.json)
      })
    case 'REQUEST_PUBLISHER_ERROR':
      return Object.assign({}, state, {
        isFetchingPublisher: false,
        errorFetchingPublisher: action.error,
      })
    default:
      return state
  }
};
export default publisher;

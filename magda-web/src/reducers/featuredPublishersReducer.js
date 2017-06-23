// @flow
import type { FeaturedRecords, FeaturedAction } from '../types';
import {parsePublisher} from '../helpers/api';

const initialData = {
  publishers: [],
  isFetching: false,
  error: null,
  hitCount: 0
}

const featuredPublishersReducer = (state: FeaturedRecords = initialData, action: FeaturedAction) => {
  switch (action.type) {
    case 'REQUEST_FEATURED_PUBLISHERS':
      return Object.assign({}, state, {
        isFetching: true,
        error: null,
      })
    case 'REQUEST_FEATURED_PUBLISHERS_ERROR':
      return Object.assign({}, state, {
        isFetching: false,
        error: action.error,
      })
    case 'RECEIVE_FEATURED_PUBLISHERS':
      return Object.assign({}, state, {
        isFetching: false,
        publishers: action.publishers.map(p=> parsePublisher(p)),
        error: null
      })

    default:
      return state
  }
};
export default featuredPublishersReducer;

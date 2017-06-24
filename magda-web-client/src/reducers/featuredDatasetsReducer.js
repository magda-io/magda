// @flow
import type { FeaturedRecords, FeaturedAction } from '../types';
import {parseDataset} from '../helpers/record';


const initialData = {
  records: [],
  isFetching: false,
  error: null,
  hitCount: 0
}

const featuredDatasetReducer = (state: FeaturedRecords = initialData, action: FeaturedAction) => {
  switch (action.type) {
    case 'REQUEST_FEATURED_DATASETS':
      return Object.assign({}, state, {
        isFetching: true,
        error: null,
      })
    case 'REQUEST_FEATURED_DATASETS_ERROR':
      return Object.assign({}, state, {
        isFetching: false,
        error: action.error,
      })
    case 'RECEIVE_FEATURED_DATASETS':
      return Object.assign({}, state, {
        isFetching: false,
        records: action.json && action.json.map(d=>parseDataset(d)),
        error: null
      })

    default:
      return state
  }
};
export default featuredDatasetReducer;

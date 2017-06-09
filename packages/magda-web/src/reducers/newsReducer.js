// @flow
import type { FeaturedRecords, DataSearchJson, Dataset, FeaturedAction, Query } from '../types';

const initialData = {
  news: [],
  isFetching: false,
  error: null,
}

const newsReducer = (state = initialData, action) => {
  switch (action.type) {
    case 'REQUEST_NEWS':
      return Object.assign({}, state, {
        isFetching: true,
        error: null,
      })
    case 'REQUEST_NEWS_ERROR':
      return Object.assign({}, state, {
        isFetching: false,
        error: action.error,
      })
    case 'RECEIVE_NEWS':
      return Object.assign({}, state, {
        isFetching: false,
        news: action.news,
        error: null
      })

    default:
      return state
  }
};
export default newsReducer;

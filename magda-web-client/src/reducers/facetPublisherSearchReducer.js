// @flow
import type { FacetAction, FacetSearchState } from '../types';

const initialData = {
  isFetching: false,
  data: [],
  generalQuery: '',
  facetQuery: ''
}

const facetPublisher = (state: FacetSearchState = initialData, action: FacetAction ) => {
  switch (action.type) {
    case 'FACET_REQUEST_PUBLISHERS':
      return Object.assign({}, state, {
        isFetching: true
      })
    case 'FACET_RECEIVE_PUBLISHERS':
      return Object.assign({}, state, {
        isFetching: false,
        data: (action.json && action.json.options) && action.json.options,
        generalQuery: action.generalQuery && action.generalQuery,
        facetQuery: action.facetQuery && action.facetQuery
      })
    default:
      return state
  }
};
export default facetPublisher;

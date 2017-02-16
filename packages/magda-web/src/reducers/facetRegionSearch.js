// @flow 
import type { Action, FacetSearchState } from '../types';

const initialData = {
  isFetching: false,
  facetQuery: '',
  data: []
}

const facetRegionSearch = (state: FacetSearchState =initialData, action: Action) => {
  switch (action.type) {
    case 'REQUEST_REGIONS':
      return Object.assign({}, state, {
        isFetching: true
      })
    case 'RECEIVE_REGIONS':
      return Object.assign({}, state, {
        isFetching: false,
        data: (action.json && action.json.options) && action.json.options,
        facetQuery: action.facetQuery && action.facetQuery
      })
    default:
      return state
  }
};
export default facetRegionSearch;

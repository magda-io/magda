// @flow 
import type { Action, FacetSearchState } from '../types';

const initialData = {
  isFetching: false,
  facetQuery: '',
  data: []
}

const facetRegionSearch = (state: FacetSearchState =initialData, action: Action) => {
  switch (action.type) {
    case 'FACET_REQUEST_REGIONS':
      return Object.assign({}, state, {
        isFetching: true
      })
    case 'FACET_RECEIVE_REGIONS':
      return Object.assign({}, state, {
        isFetching: false,
        data: (action.json && action.json.regions) && action.json.regions,
        facetQuery: action.facetQuery && action.facetQuery
      })
    default:
      return state
  }
};
export default facetRegionSearch;

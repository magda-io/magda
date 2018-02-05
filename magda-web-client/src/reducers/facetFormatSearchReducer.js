// @flow
import type { FacetAction, FacetSearchState } from '../helpers/datasetSearch';

const initialData = {
  isFetching: false,
  data: [],
  generalQuery: '',
}

const facetFormatSearch = (state: FacetSearchState=initialData, action: FacetAction) => {
  switch (action.type) {
    case 'FACET_REQUEST_FORMATS':
      return Object.assign({}, state, {
        isFetching: true
      })
    case 'FACET_RECEIVE_FORMATS':
      return Object.assign({}, state, {
        isFetching: false,
        data: (action.json && action.json.options) && action.json.options,
        generalQuery: action.generalQuery && action.generalQuery,
      })
    default:
      return state
  }
};
export default facetFormatSearch;

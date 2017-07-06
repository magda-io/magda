// @flow
import type { FacetAction, RegionMappingState } from '../types';

const initialData = {
  isFetching: false,
  data: {}
}

const regionMapping = (state: RegionMappingState = initialData, action: FacetAction) => {
  switch (action.type) {
    case 'REQUEST_REGION_MAPPING':
      return Object.assign({}, state, {
        isFetching: true
      })
    case 'RECEIVE_REGION_MAPPING':
      return Object.assign({}, state, {
        isFetching: false,
        data: (action.json && action.json.regionWmsMap) && action.json.regionWmsMap,
      })
    default:
      return state
  }
};
export default regionMapping;

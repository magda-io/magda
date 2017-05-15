// eslint-disable-next-line
import expect from 'expect';
// eslint-disable-next-line
import deepFreeze from 'deep-freeze';
import datasetSearch from './datasetSearchReducer';
import facetPublisherSearch from './facetPublisherSearchReducer';
import facetRegionSearch from './facetRegionSearchReducer';
import facetFormatSearch from './facetFormatSearchReducer';
import regionMapping from './regionMappingReducer';
import record from './recordReducer';
import publisher from './publisherReducer';
import project from './projectReducer';

import { combineReducers } from 'redux';

const reducer = combineReducers({
  regionMapping,
  datasetSearch,
  facetPublisherSearch,
  facetRegionSearch,
  facetFormatSearch,
  record,
  publisher,
  project,
});

export default reducer;

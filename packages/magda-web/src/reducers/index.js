// eslint-disable-next-line
import expect from 'expect';
// eslint-disable-next-line
import deepFreeze from 'deep-freeze';
import results from './results';
import facetPublisherSearch from './facetPublisherSearch';
import facetRegionSearch from './facetRegionSearch';
import facetFormatSearch from './facetFormatSearch';
import regionMapping from './regionMapping';
import pageStats from './pageStats';
import dataset from './datasetReducer';

import { combineReducers } from 'redux';

const search = combineReducers({
  regionMapping,
  results,
  facetPublisherSearch,
  facetRegionSearch,
  facetFormatSearch,
  dataset
});

export default search;

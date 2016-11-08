import expect from 'expect';
import deepFreeze from 'deep-freeze';
import results from './results';
import facetPublisherSearch from './facetPublisherSearch';
import facetRegionSearch from './facetRegionSearch';

import { combineReducers } from 'redux';

const search = combineReducers({
  results,
  facetPublisherSearch,
  facetRegionSearch
});

export default search;

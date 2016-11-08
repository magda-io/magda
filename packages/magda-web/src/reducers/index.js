import expect from 'expect';
import deepFreeze from 'deep-freeze';
import getJSON from '../helpers/getJSON';
import results from './results';
import facetPublisherSearch from './facetPublisherSearch';

import { combineReducers } from 'redux';

const search = combineReducers({
  results,
  facetPublisherSearch
});

export default search;

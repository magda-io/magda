import expect from 'expect';
import deepFreeze from 'deep-freeze';
import getJSON from '../helpers/getJSON';
import results from './results';
import { combineReducers } from 'redux';

const search = combineReducers({
  results: results,
});

export default search;

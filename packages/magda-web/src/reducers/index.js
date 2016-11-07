import expect from 'expect';
import deepFreeze from 'deep-freeze';
import getJSON from '../helpers/getJSON';
import datasets from './datasets';
import publisherFacet from './publisherFacet';
import { combineReducers } from 'redux';

// name the reducer the same as the state key they manage


const defaultState ={
  datasets: [],
  publisherFacet: [],
  formatFacet: [],
  temporalFacet: [],
  regionFacet: []
}
const search = combineReducers({
  datasets: datasets,
  publisherFacet: publisherFacet
});

const testSearch = () => {
  const stateBefore = [{id: 'GA', hitCount: 20, active: false}];
  const action = {
    type: 'TOGGLE',
    id: 'GA',
  };
  const stateAfter = [{id: 'GA', hitCount: 20, active: true}];


  deepFreeze(stateBefore);
  deepFreeze(stateAfter);

  expect(
    search(stateBefore, action)
  ).toEqual(stateAfter);
}


export default search;

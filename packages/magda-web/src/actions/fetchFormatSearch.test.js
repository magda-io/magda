import * as actions from '../actions/facetFormatSearch';
import {actionTypes} from '../constants/ActionTypes';
import configureMockStore from 'redux-mock-store';
import thunk from 'redux-thunk';
import mock from 'fetch-mock';
import expect from 'expect';

describe('format search actions', () => {
  it('should request format', () => {
    const generalQuery = '';
    const facetQuery = '';
    const expectedAction = {
      type: actionTypes.REQUEST_FORMATS,
      generalQuery,
      facetQuery
    }
    expect(actions.requestFormats(generalQuery, facetQuery)).toEqual(expectedAction)
  })
})

describe('format search actions', () => {
  it('should receive format', () => {
    const json = {};
    const generalQuery = '';
    const facetQuery = '';
    const expectedAction = {
      type: actionTypes.RECEIVE_FORMATS,
      json,
      generalQuery,
      facetQuery
    }
    expect(actions.receiveFormats(generalQuery, facetQuery, json)).toEqual(expectedAction)
  })
})

// async test
// ISSUE: not able to override fetch 
// const middlewares = [ thunk ]
// const mockStore = configureMockStore(middlewares)
//
// describe('async actions', () => {
//   afterEach(() => {
//     mock.restore();
//   })
//
//   it('fetch format search', () => {
//     mock.get('*', {json: {}});;
//
//     const generalQuery = '';
//     const facetQuery = '';
//     const expectedActions = [
//       { type: actionTypes.REQUEST_FORMATS,
//         generalQuery,
//         facetQuery
//       },
//       { type: actionTypes.RECEIVE_FORMATS,
//         json: {},
//         generalQuery,
//         facetQuery
//       }
//     ]
//
//     const store = mockStore({ json: {} })
//
//     return store.dispatch(actions.fetchFormatSearchResults(generalQuery, facetQuery))
//       .then(() => { // return of async actions
//         expect(store.getActions()).toEqual(expectedActions)
//       })
//   })
// })

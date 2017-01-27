import * as actions from '../actions/facetFormatSearch';
import {actionTypes} from '../constants/ActionTypes';

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

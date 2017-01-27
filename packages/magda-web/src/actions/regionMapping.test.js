import * as actions from '../actions/regionMapping';
import {actionTypes} from '../constants/ActionTypes';

describe('region mapping actions', () => {
  it('should request region mapping', () => {
    const expectedAction = {
      type: actionTypes.REQUEST_REGION_MAPPING,
    }
    expect(actions.requestRegionMapping()).toEqual(expectedAction)
  })
})

describe('region mapping actions', () => {
  it('should receive region mapping', () => {
    const json = {};
    const expectedAction = {
      type: actionTypes.RECEIVE_REGION_MAPPING,
      json
    }
    expect(actions.receiveRegionMapping(json)).toEqual(expectedAction)
  })
})

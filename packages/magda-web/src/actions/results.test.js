import * as actions from '../actions/results';
import {actionTypes} from '../constants/ActionTypes';

describe('results actions', () => {
  it('should create an action to initiate an api request', () => {
    const apiQuery ='';
    const expectedAction = {
      type: actionTypes.REQUEST_RESULTS,
      apiQuery
    }
    expect(actions.requestResults(apiQuery)).toEqual(expectedAction)
  })
})

describe('results actions', () => {
  it('should receive results', () => {
    const apiQuery ='';
    const json = {};
    const expectedAction = {
      type: actionTypes.RECEIVE_RESULTS,
      apiQuery,
      json
    }
    expect(actions.receiveResults(apiQuery, json)).toEqual(expectedAction)
  })
})

describe('results actions', () => {
  it('should catch error', () => {
    const errorMessage ='';
    const expectedAction = {
      type: actionTypes.FETCH_ERROR,
      errorMessage
    }
    expect(actions.transferFailed(errorMessage)).toEqual(expectedAction)
  })
})

describe('results actions', () => {
  it('should add publisher', () => {
    const item ={};
    const expectedAction = {
      type: actionTypes.ADD_PUBLISHER,
      item
    }
    expect(actions.addPublisher(item)).toEqual(expectedAction)
  })
})

describe('results actions', () => {
  it('should remove publisher', () => {
    const item ={};
    const expectedAction = {
      type: actionTypes.REMOVE_PUBLISHER,
      item
    }
    expect(actions.removePublisher(item)).toEqual(expectedAction)
  })
})

describe('results actions', () => {
  it('should reset publisher', () => {
    const expectedAction = {
      type: actionTypes.RESET_PUBLISHER,
    }
    expect(actions.resetPublisher()).toEqual(expectedAction)
  })
})

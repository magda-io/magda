import {config}ureMockStore from 'redux-mock-store'
import thunk from 'redux-thunk'
import * as actions from '../actions/results'
import * as types from '../constants/ActionTypes'
import nock from 'nock'
import expect from 'expect' // You can use any testing library


const middlewares = [ thunk ]
const mockStore = configureMockStore(middlewares)

describe('async actions', () => {
  afterEach(() => {
    nock.cleanAll()
  })

  it('creates RECEIVE_RESULTS when fetching results has been done', () => {
    nock('http://magda-search-api.terria.io/')
      .get('/datasets/search?query=water')
      .reply(200, { body: { results: {dataset: []}  }})

    const expectedActions = [
      { type: types.REQUEST_RESULTS},
      { type: types.RECEIVE_RESULTS, body: { results: {dataset: []}  } }
    ]
    const store = mockStore({ results: {} })

    return store.dispatch(actions.fetchSearchResults())
      .then(() => { // return of async actions
        console.log(store.getActions());
        // expect(store.getActions()).toEqual(expectedActions)
      })
  })
})

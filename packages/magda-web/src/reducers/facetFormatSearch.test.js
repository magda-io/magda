import {actionTypes} from '../constants/ActionTypes';
import reducer from './facetFormatSearch';

describe('format search reducer', () => {
  it('should return the initial state', () => {
    expect(
      reducer(undefined, {})
    ).toEqual(
      {
        isFetching: false,
        query: {generalQuery: '', facetQuery: ''},
        data: []
      }
    )
  });

  it('should handle REQUEST_FORMATS', () => {
    expect(
      reducer([], {
        type: actionTypes.REQUEST_FORMATS
      })
    ).toEqual(
      {
        isFetching: true
      }
    )
  });

  it('should handle RECEIVE_FORMATS', () => {
    const json = {
      options: []
    }
    expect(
      reducer([], {
        type: actionTypes.RECEIVE_FORMATS,
        generalQuery: '',
        facetQuery: '',
        json
      })
    ).toEqual(
      {
        isFetching: false,
        data: [],
        facetQuery: "",
        generalQuery: ""
      }
    )
  });
});

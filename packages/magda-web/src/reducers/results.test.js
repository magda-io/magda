import {actionTypes} from '../constants/ActionTypes';
import reducer from './results';

describe('results reducer', () => {
  it('should return the initial state', () => {
    expect(
      reducer(undefined, {})
    ).toEqual(
      {
        isFetching: false,
        datasets: [],
        hitCount: 0,
        progress: 0,
        activePublishers: [],
        activeFormats: [],
        activeRegion: {
            regionId: undefined,
            regionType: undefined,
            boundingBox: {
            west: 105,
            south: -45,
            east: 155,
            north: -5
          }
        },
        activeDateFrom: undefined,
        activeDateTo:undefined,
        freeText: '',
        publisherOptions: [],
        temporalOptions: [],
        formatOptions: [],
        apiQuery: '',
        hasError: false,
        strategy: "match-all",
        errorMessage: ''
      }
    )
  });
});

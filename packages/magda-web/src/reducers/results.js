import findIndex from 'lodash.findindex';

const initialData = {
  isFetching: true,
  data: {},
  query: '',
  activePublishers: [],
  activeFormats: [],
  activeTemporals: [],
  activeRegions: [],
  publisherSearchResults: [],
  formatSearchResults: [],
  regionSearchResults: []
}

const results = (state=initialData, action) => {
  switch (action.type) {
    case 'REQUEST_RESULTS':
      return Object.assign({}, state, {
        isFetching: true
      })
    case 'RECEIVE_RESULTS':
      let data = action.json;
      let query = data.query;

      let activePublishers = query.publishers.map(item=> find(data.facets[0].options));
      return Object.assign({}, state, {
        isFetching: false,
        data,
        query,
        activePublishers
      })

    case 'ADD_PUBLISHER':
      return Object.assign({}, state, {
        activePublishers: [...state.activePublishers, action.item]
      })

    case 'REMOVE_PUBLISHER':
     let index = findIndex(state.activePublishers, item=> item.value === action.item.value);
      return Object.assign({}, state, {
        activePublishers: [...state.activePublishers.slice(0, index), ...state.activePublishers.slice(index+1)]
      })

    case 'RESET_PUBLISHER':
      return Object.assign({}, state, {
        activePublishers: []
      })

    default:
      return state
  }
};
export default results;

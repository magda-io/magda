const initialData = {
  isFetching: false,
  facetQuery: '',
  data: []
}

const facetRegionSearch = (state=initialData, action) => {
  switch (action.type) {
    case 'REQUEST_REGIONS':
      return Object.assign({}, state, {
        isFetching: true
      })
    case 'RECEIVE_REGIONS':
      return Object.assign({}, state, {
        isFetching: false,
        data: action.json.regions,
        query: action.query
      })
    default:
      return state
  }
};
export default facetRegionSearch;

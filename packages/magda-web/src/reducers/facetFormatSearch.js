const initialData = {
  isFetching: false,
  query: {generalQuery: '', facetQuery: ''},
  data: []
}

const facetFormatSearch = (state=initialData, action) => {
  switch (action.type) {
    case 'REQUEST_FORMATS':
      return Object.assign({}, state, {
        isFetching: true
      })
    case 'RECEIVE_FORMATS':
      return Object.assign({}, state, {
        isFetching: false,
        data: action.json.options,
        generalQuery: action.generalQuery,
        facetQuery: action.facetQuery
      })
    default:
      return state
  }
};
export default facetFormatSearch;

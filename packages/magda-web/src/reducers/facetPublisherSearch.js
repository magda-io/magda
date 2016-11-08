const initialData = {
  isFetching: true,
  query: {generalQuery: '', facetQuery: ''},
  data: {
    hitCount: 0,
    options: []
  }
}

const facets = (state=initialData, action) => {
  switch (action.type) {
    case 'REQUEST_PUBLISHERS':
      return Object.assign({}, state, {
        isFetching: true
      })
    case 'RECEIVE_PUBLISHERS':
      return Object.assign({}, state, {
        isFetching: false,
        data: action.json,
        generalQuery: action.generalQuery,
        facetQuery: action.facetQuery
      })
    default:
      return state
  }
};
export default facets;

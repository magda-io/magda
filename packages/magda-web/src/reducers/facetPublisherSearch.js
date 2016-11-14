const initialData = {
  isFetching: false,
  query: {generalQuery: '', facetQuery: ''},
  data: []
}

const facetPublisher = (state=initialData, action) => {
  switch (action.type) {
    case 'REQUEST_PUBLISHERS':
      return Object.assign({}, state, {
        isFetching: true
      })
    case 'RECEIVE_PUBLISHERS':
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
export default facetPublisher;

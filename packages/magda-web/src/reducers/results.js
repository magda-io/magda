const initialData = {
  isFetching: true,
  data: {},
  query: ''
}

const results = (state=initialData, action) => {
  switch (action.type) {
    case 'REQUEST_RESULTS':
      return Object.assign({}, state, {
        isFetching: true
      })
    case 'RECEIVE_RESULTS':
      return Object.assign({}, state, {
        isFetching: false,
        data: action.json,
        query: action.query
      })
    default:
      return state
  }
};
export default results;

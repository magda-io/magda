const initialData = {}

const regionMapping = (state=initialData, action) => {
  switch (action.type) {
    case 'REQUEST_REGION_MAPPING':
      return Object.assign({}, state, {
        isFetching: true
      })
    case 'RECEIVE_REGION_MAPPING':
      return Object.assign({}, state, {
        isFetching: false,
        data: action.json.regionWmsMap,
      })
    default:
      return state
  }
};
export default regionMapping;

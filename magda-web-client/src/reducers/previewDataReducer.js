// @flow
const initialData = {
  previewData: {},
  isFetching: false,
  error: null,
}

type previewDataState = {
  isFetching: boolean,
  error: ?number,
  previewData: Object
}

type previewDataAction = {
  type: string,
  previewData?: Object,
  error: number
}

const previewDataReducer = (state: previewDataState = initialData, action: previewDataAction) => {
  switch (action.type) {
    case 'REQUEST_PREVIEW_DATA':
      return Object.assign({}, state, {
        isFetching: true,
        error: null,
      })
    case 'REQUEST_PREVIEW_DATA_ERROR':
      return Object.assign({}, state, {
        isFetching: false,
        error: action.error,
      })
    case 'RECEIVE_PREVIEW_DATA':
      return Object.assign({}, state, {
        isFetching: false,
        previewData: action.previewData,
        error: null
      })

    default:
      return state
  }
};
export default previewDataReducer;

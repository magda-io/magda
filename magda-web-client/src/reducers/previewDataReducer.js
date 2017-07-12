// @flow
const initialData = {
  previewData: null,
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
  previewData?: ?Object,
  error: number
}

const previewDataReducer = (state: previewDataState = initialData, action: previewDataAction) => {
  switch (action.type) {
    case 'REQUEST_DATASET_PREVIEW_DATA':
      return Object.assign({}, state, {
        isFetching: true,
        error: null,
      })
    case 'REQUEST_DATASET_PREVIEW_DATA_ERROR':
      return Object.assign({}, state, {
        isFetching: false,
        error: action.error,
      })
    case 'RECEIVE_DATASET_PREVIEW_DATA':
      return Object.assign({}, state, {
        isFetching: false,
        previewData: action.data,
        error: null
      })

    default:
      return state
  }
};
export default previewDataReducer;

// @flow
const initialData = {
  previewData: null,
  isFetching: false,
  error: null,
  fileName: undefined
}

type previewDataState = {
  isFetching: boolean,
  error: ?number,
  previewData: ?Object,
  fileName: ?string
}

type previewDataAction = {
  type: string,
  previewData?: ?Object,
  error: number,
  fileName?: ?string
}

const previewDataReducer = (state: previewDataState = initialData, action: previewDataAction) => {
  switch (action.type) {
    case 'REQUEST_DATASET_PREVIEW_DATA':
      return Object.assign({}, state, {
        isFetching: true,
        error: null,
        fileName: action.fileName
      })
    case 'REQUEST_DATASET_PREVIEW_DATA_ERROR':
      return Object.assign({}, state, {
        isFetching: false,
        error: action.error,
      })
    case 'RECEIVE_DATASET_PREVIEW_DATA':
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

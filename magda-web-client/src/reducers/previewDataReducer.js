// @flow
const initialData = {
  previewData: null,
  isFetching: false,
  error: null,
  url: ''
}

type previewDataState = {
  isFetching: boolean,
  error: ?number,
  previewData: ?Object,
  url: string
}

type previewDataAction = {
  type: string,
  previewData?: ?Object,
  error: number,
  url?: string
}

const previewDataReducer = (state: previewDataState = initialData, action: previewDataAction) => {
  switch (action.type) {
    case 'REQUEST_PREVIEW_DATA':
      return Object.assign({}, state, {
        isFetching: true,
        error: null,
        url: action.url,
        previewData: null
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
    case 'RESET_PREVIEW_DATA':
      return Object.assign({}, state, initialData)

    default:
      return state
  }
};
export default previewDataReducer;

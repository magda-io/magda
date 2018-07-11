// @flow
import type { FetchError } from "../types";

const initialData = {
    previewData: null,
    isFetching: false,
    error: null,
    url: ""
};

type previewDataState = {
    isFetching: boolean,
    error: ?number,
    previewData: ?Object,
    url: string
};

type previewDataAction = {
    type: string,
    previewData?: ?Object,
    error: FetchError,
    url?: string
};

const previewDataReducer = (
    state: previewDataState = initialData,
    action: previewDataAction
) => {
    switch (action.type) {
        case "REQUEST_PREVIEW_DATA":
            return Object.assign({}, state, {
                isFetching: true,
                error: null,
                url: action.url
            });
        case "REQUEST_PREVIEW_DATA_ERROR":
            return Object.assign({}, state, {
                isFetching: false,
                error: action.error,
                previewData: null
            });
        case "RECEIVE_PREVIEW_DATA":
            return Object.assign({}, state, {
                isFetching: false,
                previewData: Object.assign({}, action.previewData),
                error: null
            });
        case "RESET_PREVIEW_DATA":
            return Object.assign({}, state, initialData);

        default:
            return state;
    }
};
export default previewDataReducer;

import { FetchError } from "../types";

const initialData = {
    isFetching: false,
    url: ""
};

type PreviewDataState = {
    isFetching: boolean;
    error?: number;
    previewData?: any;
    url: string;
};

type PreviewDataAction = {
    type: string;
    previewData?: any;
    error: FetchError;
    url?: string;
};

const previewDataReducer = (
    state: PreviewDataState = initialData,
    action: PreviewDataAction
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

// @flow
import type { FetchError } from "../types";

const initialData = {
    content: [],
    isFetching: false,
    isFetched: false,
    error: null
};

type contentState = {
    isFetching: boolean,
    isFetched: boolean,
    error: ?number,
    content: Array<Object>
};

type contentAction = {
    type: string,
    content?: Array<Object>,
    error: FetchError
};

const contentReducer = (
    state: contentState = initialData,
    action: contentAction
) => {
    switch (action.type) {
        case "REQUEST_CONTENT":
            return Object.assign({}, state, {
                isFetching: true,
                isFetched: false,
                error: null
            });
        case "REQUEST_CONTENT_ERROR":
            return Object.assign({}, state, {
                isFetching: false,
                isFetched: true,
                error: action.error
            });
        case "RECEIVE_CONTENT":
            return Object.assign({}, state, {
                isFetching: false,
                isFetched: true,
                content: action.content,
                error: null
            });

        default:
            return state;
    }
};
export default contentReducer;

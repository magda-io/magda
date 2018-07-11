// @flow
import type { FetchError } from "../types";

const initialData = {
    news: [],
    isFetching: false,
    error: null
};

type newsState = {
    isFetching: boolean,
    error: ?number,
    news: Array<Object>
};

type newsAction = {
    type: string,
    news?: Array<Object>,
    error: FetchError
};

const newsReducer = (state: newsState = initialData, action: newsAction) => {
    switch (action.type) {
        case "REQUEST_NEWS":
            return Object.assign({}, state, {
                isFetching: true,
                error: null
            });
        case "REQUEST_NEWS_ERROR":
            return Object.assign({}, state, {
                isFetching: false,
                error: action.error
            });
        case "RECEIVE_NEWS":
            return Object.assign({}, state, {
                isFetching: false,
                news: action.news,
                error: null
            });

        default:
            return state;
    }
};
export default newsReducer;

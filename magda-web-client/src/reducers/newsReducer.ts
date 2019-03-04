import { FetchError } from "../types";

const initialData: newsState = {
    news: [],
    isFetching: false
};

type newsState = {
    isFetching: boolean;
    error?: number;
    news: Array<any>;
};

type newsAction = {
    type: string;
    news?: Array<any>;
    error: FetchError;
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

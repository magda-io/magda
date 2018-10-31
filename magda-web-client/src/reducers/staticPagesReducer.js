import type { Action } from "../types";
import { actionTypes } from "../constants/ActionTypes";

/**
 * Initial status is {}. Strcuture would be
 *
 * {
 *  "pageName": {
 *      isFetching: false,
 *      isError: false,
 *      error: null,
 *      content: null
 *  }
 * }
 */
const initialData = {};

const staticPageReducer = (state = initialData, action: Action) => {
    switch (action.type) {
        case actionTypes.REQUEST_STATIC_PAGE:
            return {
                ...state,
                [action.payload.pageName]: {
                    isFetching: true,
                    isError: false,
                    isFetched: false,
                    error: null,
                    title: "Loading...",
                    content: "Please wait..."
                }
            };
        case actionTypes.RECEIVE_STATIC_PAGE:
            return {
                ...state,
                [action.payload.pageName]: {
                    isFetching: false,
                    isError: false,
                    isFetched: true,
                    error: null,
                    title: action.payload.content.title,
                    content: action.payload.content.content
                }
            };
        case actionTypes.REQUEST_STATIC_PAGE_ERROR:
            return {
                ...state,
                [action.payload.pageName]: {
                    isFetching: false,
                    isError: true,
                    isFetched: true,
                    error: action.payload.error,
                    title: "Error",
                    content: action.payload.error
                }
            };
        default:
            return state;
    }
};
export default staticPageReducer;

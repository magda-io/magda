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
                    error: null,
                    content: null
                }
            };
        case actionTypes.RECEIVE_STATIC_PAGE:
            return {
                ...state,
                [action.payload.pageName]: {
                    isFetching: false,
                    isError: false,
                    error: null,
                    content: action.payload.content
                }
            };
        case actionTypes.REQUEST_STATIC_PAGE_ERROR:
            return {
                ...state,
                [action.payload.pageName]: {
                    isFetching: false,
                    isError: true,
                    error: action.payload.error,
                    content: ""
                }
            };
        default:
            return state;
    }
};
export default staticPageReducer;

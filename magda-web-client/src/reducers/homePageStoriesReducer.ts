import { Action } from "../types";
import { actionTypes } from "../constants/ActionTypes";

const initialStoryData = {
    isFetching: false,
    isError: false,
    error: null,
    content: null
};

const defaultStoryNumber = 6;

const initialData = new Array(defaultStoryNumber)
    .fill(initialStoryData)
    .map((item) => ({ ...item })); //--- make sure object copies are created.

const homepageStories = (state = initialData, action: Action) => {
    let newState;
    switch (action.type) {
        case actionTypes.REQUEST_HOMEPAGE_STORY:
            newState = state.slice();
            newState[action.payload.idx] = {
                ...state[action.payload.idx],
                isFetching: true,
                isError: false,
                errorMessage: null,
                content: null
            };
            return newState;
        case actionTypes.RECEIVE_HOMEPAGE_STORY:
            newState = state.slice();
            newState[action.payload.idx] = {
                ...state[action.payload.idx],
                isFetching: false,
                isError: false,
                errorMessage: null,
                content: action.payload.content
            };
            return newState;
        case actionTypes.REQUEST_HOMEPAGE_STORY_ERROR:
            newState = state.slice();
            newState[action.payload.idx] = {
                ...state[action.payload.idx],
                isFetching: false,
                isError: true,
                error: action.payload.error,
                content: action.payload.content
            };
            return newState;
        default:
            return state;
    }
};
export default homepageStories;

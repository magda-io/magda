import type { Action } from "../types";
import { actionTypes } from "../constants/ActionTypes";

const initialData = {
    isShown: false
};

const topBanner = (state = initialData, action: Action) => {
    switch (action.type) {
        case actionTypes.TOGGLE_PREVIEW_BANNER:
            return { ...state, isShown: !state.isShown };
        default:
            return state;
    }
};
export default topBanner;

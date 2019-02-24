import { Action } from "../types";
import { actionTypes } from "../constants/ActionTypes";

const initialData = {
    isShown: true
};

const topBanner = (state = initialData, action: Action) => {
    switch (action.type) {
        case actionTypes.CLOSE_TOP_BANNER:
            return { ...state, isShown: false };
        default:
            return state;
    }
};
export default topBanner;

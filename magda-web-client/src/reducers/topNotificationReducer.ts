import { Action } from "../types";
import { actionTypes } from "../constants/ActionTypes";

const initialData = {
    visible: false,
    type: "", //--- "" for default style; "error" for error notification
    title: "Notice",
    message: "",
    onDismiss: null
};

const topNotification = (state = initialData, action: Action) => {
    switch (action.type) {
        case actionTypes.SHOW_TOP_NOTIFICATION:
            return Object.assign({}, state, {
                visible: true,
                type: action.payload.type ? action.payload.type : "",
                title: action.payload.title
                    ? action.payload.title
                    : initialData.title,
                message: action.payload.message ? action.payload.message : "",
                onDismiss:
                    action.payload.onDismiss &&
                    typeof action.payload.onDismiss === "function"
                        ? action.payload.onDismiss
                        : null
            });
        case actionTypes.HIDE_TOP_NOTIFICATION:
            return Object.assign({}, state, initialData);
        default:
            return state;
    }
};
export default topNotification;

import { actionTypes } from "../constants/ActionTypes";

export function showTopNotification(
    message,
    title = "",
    type = "",
    onDismiss = null
) {
    return {
        type: actionTypes.SHOW_TOP_NOTIFICATION,
        payload: {
            message,
            title,
            type,
            onDismiss
        }
    };
}

export function hideTopNotification() {
    return {
        type: actionTypes.HIDE_TOP_NOTIFICATION
    };
}

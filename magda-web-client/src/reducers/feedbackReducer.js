// @flow
import type { FetchError } from "../types";

const initialData = {
    isSendingFeedback: false,
    sendFeedbackSuccess: false,
    sendFeedbackFailed: false
};

type newsState = {
    isSendingFeedback: boolean,
    sendFeedbackSuccess: boolean,
    sendFeedbackFailed: boolean
};

type newsAction = {
    type: string,
    error: FetchError
};

const feedbackReducer = (
    state: newsState = initialData,
    action: newsAction
) => {
    switch (action.type) {
        case "SEND_FEEDBACKS":
            return Object.assign({}, state, {
                isSendingFeedback: true,
                sendFeedbackSuccess: false,
                sendFeedbackFailed: false
            });
        case "SEND_FEEDBACKS_FAILED":
            return Object.assign({}, state, {
                isSendingFeedback: false,
                sendFeedbackSuccess: false,
                sendFeedbackFailed: true
            });
        case "SEND_FEEDBACKS_SUCCESS":
            return Object.assign({}, state, {
                isSendingFeedback: false,
                sendFeedbackSuccess: true,
                sendFeedbackFailed: false
            });
        case "RESET_FEEDBACK":
            return Object.assign({}, state, {
                isSendingFeedback: false,
                sendFeedbackSuccess: false,
                sendFeedbackFailed: false
            });
        default:
            return state;
    }
};
export default feedbackReducer;

// @flow
import type { FetchError } from "../types";

const initialData = {
    isSendingFeedback: false,
    sendFeedbackSuccess: false,
    sendFeedbackFailed: false,
    isShowingFeedbackForm: false
};

type feedbackState = {
    isSendingFeedback: boolean,
    sendFeedbackSuccess: boolean,
    sendFeedbackFailed: boolean,
    isShowingFeedbackForm: boolean
};

type feedbackAction = {
    type: string,
    error: FetchError
};

const feedbackReducer = (
    state: feedbackState = initialData,
    action: feedbackAction
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
        case "SHOW_FEEDBACK_FORM":
            return Object.assign({}, state, {
                isShowingFeedbackForm: true
            });
        case "HIDE_FEEDBACK_FORM":
            return Object.assign({}, state, {
                isShowingFeedbackForm: false
            });
        default:
            return state;
    }
};
export default feedbackReducer;

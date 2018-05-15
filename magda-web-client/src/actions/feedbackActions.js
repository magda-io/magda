import { config } from "../config";
import fetch from "isomorphic-fetch";
import { actionTypes } from "../constants/ActionTypes";
import type { Action } from "../types";
import type { Error } from "../types";

export function showFeedbackForm(): Action {
    return {
        type: actionTypes.SHOW_FEEDBACK_FORM
    };
}

export function hideFeedbackForm(): Action {
    return {
        type: actionTypes.HIDE_FEEDBACK_FORM
    };
}

export function sendFeedbacks(): Action {
    return {
        type: actionTypes.SEND_FEEDBACKS
    };
}

export function sendFeedbackSuccess(): Action {
    return {
        type: actionTypes.SEND_FEEDBACKS_SUCCESS
    };
}

export function sendFeedbackFailed(error: Error): Action {
    return {
        type: actionTypes.SEND_FEEDBACKS_FAILED,
        error
    };
}

export function resetFeedback() {
    return {
        type: actionTypes.RESET_FEEDBACK
    };
}

export function fetchFeedback(values) {
    return (dispatch: Function, getState: Function) => {
        dispatch(sendFeedbacks());
        fetch(config.feedbackUrl, {
            method: "POST",
            body: values,
            responseType: "json",
            headers: {
                "Content-Type": "application/json"
            }
        })
            .then(response => {
                if (response.ok) {
                    return dispatch(sendFeedbackSuccess());
                }
                return dispatch(
                    sendFeedbackFailed({
                        title: response.status,
                        detail: response.statusText
                    })
                );
            })
            .catch(error => dispatch(sendFeedbackFailed(error)));
    };
}

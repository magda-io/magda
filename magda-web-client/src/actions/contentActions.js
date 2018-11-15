import { config } from "../config";
import { actionTypes } from "../constants/ActionTypes";
import type { Action } from "../types";
import type { Error } from "../types";

export function requestContent(): Action {
    return {
        type: actionTypes.REQUEST_CONTENT
    };
}

export function receiveContent(content: Object): Action {
    return {
        type: actionTypes.RECEIVE_CONTENT,
        content
    };
}

export function requestContentError(error: Error): Action {
    return {
        type: actionTypes.REQUEST_CONTENT_ERROR,
        error
    };
}

export function fetchContent() {
    return (dispatch: Function, getState: Function) => {
        // check if we need to fetch
        if (getState().content.isFetching || getState().content.isFetched) {
            return false;
        }
        fetch(config.contentUrl, config.fetchOptions)
            .then(response => {
                if (response.status === 200) {
                    return response.json();
                }
                throw new Error(response.statusText);
            })
            .then(text => {
                dispatch(receiveContent(text));
            })
            .catch(error =>
                dispatch(
                    requestContentError({
                        title: error.name,
                        detail: error.message
                    })
                )
            );
    };
}

export function requestContentReset(): Action {
    return {
        type: actionTypes.REQUEST_CONTENT_RESET
    };
}

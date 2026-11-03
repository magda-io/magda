import { config } from "../config";
import fetch from "cross-fetch";
import { actionTypes } from "../constants/ActionTypes";
import { Action } from "../types";
import createNoCacheFetchOptions from "../api-clients/createNoCacheFetchOptions";

export function requestContent(): Action {
    return {
        type: actionTypes.REQUEST_CONTENT
    };
}

export function receiveContent(content: any): Action {
    return {
        type: actionTypes.RECEIVE_CONTENT,
        content
    };
}

export function requestContentError(error: any): Action {
    return {
        type: actionTypes.REQUEST_CONTENT_ERROR,
        error
    };
}

export function fetchContent(noCache: boolean = false) {
    return async (dispatch: Function, getState: Function) => {
        // check if we need to fetch
        if (getState().content.isFetching) {
            return;
        }
        await fetch(
            config.contentUrl,
            noCache
                ? createNoCacheFetchOptions(config.commonFetchRequestOptions)
                : config.commonFetchRequestOptions
        )
            .then((response) => {
                if (response.status === 200) {
                    return response.json();
                }
                throw new Error(response.statusText);
            })
            .then((text) => {
                dispatch(receiveContent(text));
            })
            .catch((error) =>
                dispatch(
                    requestContentError({
                        title: error.name,
                        detail: error.message
                    })
                )
            );
    };
}

import { config } from "../config";
import fetch from "isomorphic-fetch";
import { actionTypes } from "../constants/ActionTypes";
import { Action } from "../types";
import request from "helpers/request";

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

export function fetchContent() {
    return (dispatch: Function, getState: Function) => {
        // check if we need to fetch
        if (getState().content.isFetching) {
            return false;
        }
        fetch(config.contentUrl, config.credentialsFetchOptions)
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
        return undefined;
    };
}

export async function createContent(contentId, content) {
    const contentIdUrl = config.contentApiURL + contentId;
    try {
        await request("GET", contentIdUrl);
    } catch (e) {
        await request("PUT", contentIdUrl, content, "application/json");
    }
}

export async function listContent(...contentIdPattern) {
    const contentIdUrl =
        config.contentApiURL +
        "all?inline=true&" +
        contentIdPattern.map((id) => `id=${id}`).join("&");
    return request("GET", contentIdUrl);
}

export async function deleteContent(contentId) {
    const contentIdUrl = config.contentApiURL + contentId;
    return request("DELETE", contentIdUrl);
}

export async function readContent(contentId) {
    const contentIdUrl = config.contentApiURL + contentId + ".json";
    return request("GET", contentIdUrl);
}

export async function updateContent(contentId, patch) {
    const contentIdUrl = config.contentApiURL + contentId;
    let content = await readContent(contentId);
    Object.assign(content, patch);
    await request("PUT", contentIdUrl, content, "application/json");
}

export async function writeContent(contentId, content, mime) {
    const contentIdUrl = config.contentApiURL + contentId;
    await request("PUT", contentIdUrl, content, mime);
}

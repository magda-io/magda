import { actionTypes } from "../constants/ActionTypes";
import fetch from "isomorphic-fetch";
import { config } from "../config";

export function fetchHomepageStory(idx) {
    return async (dispatch, getState) => {
        try {
            const { homepageStories } = getState();
            if (
                !homepageStories[idx].isFetching &&
                !homepageStories[idx].isError &&
                homepageStories[idx].content
            )
                return;

            if (
                !config.homePageConfig ||
                !config.homePageConfig.stories ||
                !config.homePageConfig.stories.length ||
                !config.homePageConfig.stories[idx]
            ) {
                throw new Error(`Cannot locate config for story ${idx}`);
            }

            dispatch(requestHomepageStory(idx));

            const baseUrl = config.homePageConfig.baseUrl
                ? config.homePageConfig.baseUrl
                : "";
            const url = baseUrl + config.homePageConfig.stories[idx];

            const response = await fetch(url, config.credentialsFetchOptions);
            if (response.status !== 200)
                throw new Error(
                    `Failed to load data. Status code: ${response.status}`
                );
            const content = await response.text();

            dispatch(receiveHomepageStory(idx, content));
        } catch (e) {
            dispatch(requestHomepageStoryError(idx, e));
        }
    };
}

export function requestHomepageStory(idx) {
    return {
        type: actionTypes.REQUEST_HOMEPAGE_STORY,
        payload: {
            idx
        }
    };
}

export function receiveHomepageStory(idx, content) {
    return {
        type: actionTypes.RECEIVE_HOMEPAGE_STORY,
        payload: {
            idx,
            content
        }
    };
}

export function requestHomepageStoryError(idx, error) {
    return {
        type: actionTypes.REQUEST_HOMEPAGE_STORY_ERROR,
        payload: {
            idx,
            error
        }
    };
}

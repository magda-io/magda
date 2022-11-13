import fetch from "isomorphic-fetch";
import { config } from "../config";
import { actionTypes } from "../constants/ActionTypes";

export function requestPublishers(ids: Array<string>) {
    return {
        type: actionTypes.REQUEST_FEATURED_PUBLISHERS,
        ids
    };
}

export function receivePublishers(json: Array<any>) {
    return {
        type: actionTypes.RECEIVE_FEATURED_PUBLISHERS,
        json
    };
}

export function fetchFeaturedPublishersFromRegistry(ids: Array<string>): any {
    return (dispatch: Function, getState: Function) => {
        if (getState().featuredPublishers.isFetching) {
            return false;
        }
        dispatch(requestPublishers(ids));
        const fetches = ids.map((id) =>
            fetch(
                config.registryReadOnlyApiUrl +
                    `records/${id}?aspect=organization-details`,
                config.commonFetchRequestOptions
            ).then((response) => response.json())
        );
        Promise.all(fetches).then((jsons) =>
            dispatch(receivePublishers(jsons))
        );
        return undefined;
    };
}

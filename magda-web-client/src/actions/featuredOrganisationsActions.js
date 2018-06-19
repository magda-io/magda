// @flow
import fetch from "isomorphic-fetch";
import { config } from "../config";
import { actionTypes } from "../constants/ActionTypes";

export function requestOrganisations(ids: Array<string>) {
    return {
        type: actionTypes.REQUEST_FEATURED_ORGANISATIONS,
        ids
    };
}

export function receiveOrganisations(json: Array<Object>) {
    return {
        type: actionTypes.RECEIVE_FEATURED_ORGANISATIONS,
        json
    };
}

export function fetchFeaturedOrganisationsFromRegistry(
    ids: Array<string>
): Object {
    return (dispatch: Function, getState: Function) => {
        if (getState().featuredOrganisations.isFetching) {
            return false;
        }
        dispatch(requestOrganisations(ids));
        const fetches = ids.map(id =>
            fetch(
                config.registryApiUrl +
                    `records/${id}?aspect=organization-details`
            ).then(response => response.json())
        );
        Promise.all(fetches).then(jsons =>
            dispatch(receiveOrganisations(jsons))
        );
    };
}

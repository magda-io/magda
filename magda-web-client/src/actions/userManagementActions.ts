import fetch from "isomorphic-fetch";
import { config } from "../config";
import { actionTypes } from "../constants/ActionTypes";
import { Dispatch, GetState } from "../types";
import { FacetAction } from "../helpers/datasetSearch";
import request from "helpers/request";

export function requestWhoAmI() {
    return (dispatch: Dispatch, getState: GetState) => {
        if (getState().userManagement.isFetchingWhoAmI) {
            return false;
        }

        dispatch({
            type: actionTypes.REQUEST_WHO_AM_I
        });

        fetch(config.authApiUrl + "users/whoami", {
            ...config.fetchOptions,
            credentials: "include"
        })
            .then(async response => {
                if (response.status === 200) {
                    const res = await response.json();
                    if (res.isError) {
                        switch (res.errorCode) {
                            case 401:
                                dispatch(receiveWhoAmISignedOut());
                                break;
                            default:
                                throw new Error(
                                    "Error when fetching current user: " +
                                        res.errorCode
                                );
                        }
                    } else {
                        dispatch(receiveWhoAmISignedIn(res));
                    }
                } else {
                    throw new Error(
                        "Error when fetching current user: " + response.status
                    );
                }
            })
            .catch(err => dispatch(receiveWhoAmIError(err)));
        return undefined;
    };
}

export function receiveWhoAmISignedIn(user: any): any {
    return {
        type: actionTypes.RECEIVE_WHO_AM_I_SIGNED_IN,
        user
    };
}

export function receiveWhoAmISignedOut(): any {
    return {
        type: actionTypes.RECEIVE_WHO_AM_I_SIGNED_OUT
    };
}

export function receiveWhoAmIError(err: any): any {
    return {
        type: actionTypes.RECEIVE_WHO_AM_I_ERROR,
        err
    };
}

export function requestSignOut() {
    return (dispatch: Dispatch, getState: GetState) => {
        if (getState().userManagement.isSigningOut) {
            return false;
        }

        dispatch({
            type: actionTypes.REQUEST_SIGN_OUT
        });

        fetch(config.baseUrl + "auth/logout", {
            ...config.fetchOptions,
            credentials: "include"
        }).then(response => {
            if (response.status <= 400) {
                dispatch(completedSignOut());
                return;
            } else {
                dispatch(
                    signOutError(
                        new Error("Error signing out: " + response.status)
                    )
                );
            }
        });
        return undefined;
    };
}

export function completedSignOut(): FacetAction {
    return {
        type: actionTypes.COMPLETED_SIGN_OUT
    };
}

export function signOutError(error: any): FacetAction {
    return {
        type: actionTypes.SIGN_OUT_ERROR,
        error: error
    };
}

export function requestAuthProviders() {
    return (dispatch: Dispatch, getState: GetState) => {
        if (getState().userManagement.isFetchingAuthProviders) {
            return false;
        }

        dispatch({
            type: actionTypes.REQUEST_AUTH_PROVIDERS
        });

        fetch(config.baseUrl + "auth/providers", config.fetchOptions)
            .then(response => {
                if (response.status === 200) {
                    return response
                        .json()
                        .then(providers =>
                            dispatch(receiveAuthProviders(providers))
                        );
                } else {
                    throw new Error(
                        "Error when fetching auth providers: " + response.status
                    );
                }
            })
            .catch(err => dispatch(receiveAuthProvidersError(err)));
        return undefined;
    };
}

export function receiveAuthProviders(providers: any): any {
    return {
        type: actionTypes.RECEIVE_AUTH_PROVIDERS,
        providers
    };
}

export function receiveAuthProvidersError(err: any): any {
    return {
        type: actionTypes.RECEIVE_AUTH_PROVIDERS_ERROR,
        err
    };
}

export function listUsers() {
    return request("GET", config.authApiUrl + "users/all");
}

export function updateUser(user, patch) {
    return request(
        "PUT",
        config.authApiUrl + "users/" + user,
        patch,
        "application/json"
    );
}

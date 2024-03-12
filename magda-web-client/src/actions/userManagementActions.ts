import fetch from "cross-fetch";
import { config } from "../config";
import { actionTypes } from "../constants/ActionTypes";
import { Dispatch, GetState } from "../types";
import { FacetAction } from "../helpers/datasetSearch";
import { fetchContent } from "./contentActions";

export function requestWhoAmI(setLoading: boolean = true) {
    return async (dispatch: Dispatch, getState: GetState) => {
        if (getState().userManagement.isFetchingWhoAmI) {
            return;
        }

        if (setLoading) {
            dispatch({
                type: actionTypes.REQUEST_WHO_AM_I
            });
        }

        await fetch(config.authApiBaseUrl + "users/whoami", {
            ...config.commonFetchRequestOptions,
            credentials: "include"
        })
            .then(async (response) => {
                if (response.status === 200) {
                    const res = await response.json();
                    if (res.isError) {
                        switch (res.errorCode) {
                            default:
                                throw new Error(
                                    "Error when fetching current user: " +
                                        res.errorCode
                                );
                        }
                    } else {
                        dispatch(receiveWhoAmIUserInfo(res));
                    }
                } else {
                    throw new Error(
                        "Error when fetching current user: " + response.status
                    );
                }
            })
            .catch((err) => dispatch(receiveWhoAmIError(err)));
    };
}

export function receiveWhoAmIUserInfo(user: any): any {
    return {
        type: actionTypes.RECEIVE_WHO_AM_I_USER_INFO,
        user
    };
}

export function receiveWhoAmIError(err: any): any {
    return {
        type: actionTypes.RECEIVE_WHO_AM_I_ERROR,
        err
    };
}

export function requestSignOut() {
    return async (dispatch: Dispatch, getState: GetState) => {
        try {
            if (getState().userManagement.isSigningOut) {
                return;
            }

            dispatch({
                type: actionTypes.REQUEST_SIGN_OUT
            });

            const response = await fetch(config.baseUrl + "auth/logout", {
                ...config.commonFetchRequestOptions,
                credentials: "include"
            });

            if (response.status === 200) {
                dispatch(completedSignOut());
            } else {
                try {
                    const resData = await response.json();
                    throw new Error(resData.errorMessage);
                } catch (e) {
                    throw new Error(response.statusText);
                }
            }

            await Promise.all([
                dispatch(fetchContent(true)),
                dispatch(requestWhoAmI())
            ]);
        } catch (e) {
            // --- notify user with a simply alert box
            alert("Error signing out: " + e);
            // --- leave existing `signOutError` action dispatch for future implementation
            dispatch(signOutError(new Error("Error signing out: " + e)));
        }
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

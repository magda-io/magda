// @flow
import fetch from "isomorphic-fetch";
import { config } from "../config";
import { actionTypes } from "../constants/ActionTypes";
import type { Action, Dispatch, GetState } from "../types";

export function requestWhoAmI() {
  return (dispatch: Dispatch, getState: GetState) => {
    if (getState().userManagement.isFetchingWhoAmI) {
      return false;
    }

    dispatch({
      type: actionTypes.REQUEST_WHO_AM_I
    });

    fetch(config.authApiUrl + "/users/whoami", {
      credentials: "include"
    })
      .then(response => {
        if (response.status === 200) {
          return response
            .json()
            .then(user => dispatch(receiveWhoAmISignedIn(user)));
        } else if (response.status === 401) {
          dispatch(receiveWhoAmISignedOut());
        } else {
          throw new Error("Error when fetching current user: " + response.status);
        }
      })
      .catch(err => dispatch(receiveWhoAmIError(err)));
  };
}

export function receiveWhoAmISignedIn(user: Object): Action{
  return {
    type: actionTypes.RECEIVE_WHO_AM_I_SIGNED_IN,
    user
  };
}

export function receiveWhoAmISignedOut(): Action {
  return {
    type: actionTypes.RECEIVE_WHO_AM_I_SIGNED_OUT
  };
}

export function receiveWhoAmIError(err: Object): Action {
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

    fetch(config.apiHost + "auth/logout", {
      credentials: "include"
    }).then(response => {
      if (response.status <= 400) {
        dispatch(completedSignOut());
        return;
      } else {
        dispatch(
          signOutError(new Error("Error signing out: " + response.status))
        );
      }
    });
  };
}

export function completedSignOut(): Action {
  return {
    type: actionTypes.COMPLETED_SIGN_OUT
  };
}

export function signOutError(err: Object): Action {
  return {
    type: actionTypes.SIGN_OUT_ERROR,
    err
  };
}

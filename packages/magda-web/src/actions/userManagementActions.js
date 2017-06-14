// @flow
import fetch from "isomorphic-fetch";
import { config } from "../config";
import { actionTypes } from "../constants/ActionTypes";
import type { Action, FacetSearchJson } from "../types";

export function requestWhoAmI(): Action {
  return (dispatch: Function, getState: Function) => {
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
          return response.json();
        } else {
          throw new Error("Error when fetching current user: " + response.body);
        }
      })
      .then(user => dispatch(receiveWhoAmI(user)))
      .catch(err => dispatch(receiveWhoAmIError(err)));
  };
}

export function receiveWhoAmI(user): Action {
  return {
    type: actionTypes.RECEIVE_WHO_AM_I,
    user
  };
}

export function receiveWhoAmIError(err): Action {
  return {
    type: actionTypes.RECEIVE_WHO_AM_I_ERROR,
    err
  };
}
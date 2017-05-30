// @flow
import fetch from "isomorphic-fetch";
import { config } from "../config";
import { actionTypes } from "../constants/ActionTypes";
import type { Action, FacetSearchJson } from "../types";

// export function signIn(): Action{
//   return {
//     type: actionTypes.SIGN_IN,
//   }
// }

export function requestWhoAmI(): Action {
  return (dispatch: Function, getState: Function) => {
    console.log("requestWhoAmI");

    if (getState().userManagement.isFetchingWhoAmI) {
      return false;
    }

    dispatch({
      type: actionTypes.REQUEST_WHO_AM_I
    });

    fetch("http://localhost:3000/api/v0/auth/users/whoami", {
      credentials: "include"
    })
      .then(response => {
        if (response.status === 200) {
          return response.json();
        } else {
          return dispatch(receiveWhoAmI());
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

export function signedIn(user): Action {
  return {
    type: actionTypes.SIGNED_IN,
    user
  };
}

// export function signUp(): Action{
//   return {
//     type: actionTypes.SIGN_UP,
//   }
// }

// export function signOut(): Action{
//   return {
//     type: actionTypes.SIGN_OUT,
//   }
// }

// export function receiveRegionMapping(json: Object): Action{
//   console.log(actionTypes.RECEIVE_REGION_MAPPING);
//   return {
//     type: actionTypes.RECEIVE_REGION_MAPPING,
//     json: json,
//   }
// }

// export function fetchRegionMapping() {
//   return (dispatch: Function)=>{
//     dispatch(requestRegionMapping())
//     return fetch(config.searchApiBaseUrl + 'region-types')
//     .then(response => response.json())
//     .then((json: FacetSearchJson) =>
//       dispatch(receiveRegionMapping(json))
//     )
//   }
// }

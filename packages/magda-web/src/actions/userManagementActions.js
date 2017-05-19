// @flow
import fetch from 'isomorphic-fetch'
import {config} from '../config'
import {actionTypes} from '../constants/ActionTypes';
import type { Action, FacetSearchJson } from '../types';


// export function signIn(): Action{
//   return {
//     type: actionTypes.SIGN_IN,
//   }
// }

export function signedIn(user): Action {
  return {
    type: actionTypes.SIGNED_IN,
    user
  }
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

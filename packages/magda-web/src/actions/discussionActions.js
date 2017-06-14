// @flow
import fetch from "isomorphic-fetch";
import { config } from "../config";
import { actionTypes } from "../constants/ActionTypes";
import type { Action, FacetSearchJson } from "../types";

export function fetchDiscussionForType(type, id): Action {
  return (dispatch: Function, getState: Function) => {
    const startState = getState();
    const {
      discussionsForType: {
        [type]: { [id]: existingDiscussion = {} } = {}
      } = {}
    } = startState;

    if (existingDiscussion.loading) {
      return false;
    }

    dispatch(requestDiscussionForType(type, id));

    return fetch(config.discussionsApiUrl + `/linked/${type}/${id}`, {
      credentials: "include"
    })
      .then(response => {
        if (response.status === 200) {
          return response.json();
        } else {
          throw new Error("Error when fetching current user: " + response.body);
        }
      })
      .then(discussion =>
        dispatch(receiveDiscussionForType(type, id, discussion))
      )
      .catch(err => dispatch(receiveDiscussionForTypeError(type, id, err)));
  };
}

export function requestDiscussionForType(type, id): Action {
  return {
    type: actionTypes.REQUEST_DISCUSSION_FOR_TYPE,
    typeName: type,
    typeId: id
  };
}

export function receiveDiscussionForType(type, id, discussion): Action {
  return {
    type: actionTypes.RECEIVE_DISCUSSION_FOR_TYPE,
    typeName: type,
    typeId: id,
    discussion
  };
}

export function receiveDiscussionForTypeError(type, id, err): Action {
  return {
    type: actionTypes.RECEIVE_DISCUSSION_FOR_TYPE_ERROR,
    typeName: type,
    typeId: id,
    err
  };
}

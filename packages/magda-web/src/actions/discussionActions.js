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

    return fetch(config.discussionsApiUrl + `/linked/${type}/${id}`)
      .then(response => {
        if (response.status === 200) {
          return response.json();
        } else {
          throw new Error(
            `Error when fetching discussion for ${type} ${id}: ${response.body}`
          );
        }
      })
      .then(discussion =>
        dispatch(receiveDiscussionForType(type, id, discussion))
      )
      .catch(error => dispatch(receiveDiscussionForTypeError(type, id, error)));
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

export function receiveDiscussionForTypeError(type, id, error): Action {
  return {
    type: actionTypes.RECEIVE_DISCUSSION_FOR_TYPE_ERROR,
    typeName: type,
    typeId: id,
    error
  };
}

export function fetchMessages(discussionId): Action {
  return (dispatch: Function, getState: Function) => {
    const startState = getState();
    const {
      discussions: { [discussionId]: existingDiscussion = {} } = {}
    } = startState;

    if (existingDiscussion.loading) {
      return false;
    }

    dispatch(requestMessages(discussionId));

    return fetch(
      config.discussionsApiUrl + `/discussions/${discussionId}/messages`
    )
      .then(response => {
        if (response.status === 200) {
          return response.json();
        } else {
          throw new Error(
            `Error when fetching messages for discussion ${discussionId}: ${response.body}`
          );
        }
      })
      .then(messages => dispatch(receiveMessages(discussionId, messages)))
      .catch(error => dispatch(receiveMessagesError(discussionId, error)));
  };
}

export function requestMessages(discussionId): Action {
  return {
    type: actionTypes.REQUEST_MESSAGES,
    discussionId
  };
}

export function receiveMessages(discussionId, messages): Action {
  return {
    type: actionTypes.RECEIVE_MESSAGES,
    discussionId,
    messages
  };
}

export function receiveMessagesError(discussionId, error): Action {
  return {
    type: actionTypes.RECEIVE_MESSAGES_ERROR,
    discussionId,
    error
  };
}

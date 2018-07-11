// @flow
import fetch from "isomorphic-fetch";
import { config } from "../config";
import { actionTypes } from "../constants/ActionTypes";
import type { Dispatch, GetState } from "../types";

// export function fetchDiscussionForType(type, id): Action {
//   return (dispatch: Function, getState: Function) => {
//     const startState = getState();
//     const {
//       discussionsForType: {
//         [type]: { [id]: existingDiscussion = {} } = {}
//       } = {}
//     } = startState;

//     if (existingDiscussion.loading) {
//       return false;
//     }

//     dispatch(requestDiscussionForType(type, id));

//     return fetch(config.discussionsApiUrl + `linked/${type}/${id}`)
//       .then(response => {
//         if (response.status === 200) {
//           return response.json();
//         } else {
//           throw new Error(
//             `Error when fetching discussion for ${type} ${id}: ${response.body}`
//           );
//         }
//       })
//       .then(discussion =>
//         dispatch(receiveDiscussionForType(type, id, discussion))
//       )
//       .catch(error => dispatch(receiveDiscussionForTypeError(type, id, error)));
//   };
// }

// export function requestDiscussionForType(type, id): Action {
//   return {
//     type: actionTypes.REQUEST_DISCUSSION_FOR_TYPE,
//     typeName: type,
//     typeId: id
//   };
// }

// export function receiveDiscussionForType(type, id, discussion): Action {
//   return {
//     type: actionTypes.RECEIVE_DISCUSSION_FOR_TYPE,
//     typeName: type,
//     typeId: id,
//     discussion
//   };
// }

// export function receiveDiscussionForTypeError(type, id, error): Action {
//   return {
//     type: actionTypes.RECEIVE_DISCUSSION_FOR_TYPE_ERROR,
//     typeName: type,
//     typeId: id,
//     error
//   };
// }

export function fetchMessages(typeName: string, typeId: string) {
    return (dispatch: Dispatch, getState: () => Object) => {
        const startState = getState();
        const {
            discussions: {
                [typeName + "|" + typeId]: existingDiscussion = {}
            } = {}
        } = startState;

        if (existingDiscussion.loading) {
            return false;
        }

        dispatch(requestMessages(typeName, typeId));

        return fetch(
            config.discussionsApiUrl + `linked/${typeName}/${typeId}/messages`
        )
            .then(response => {
                if (response.status === 200) {
                    return response.json();
                } else {
                    throw new Error(
                        `Error when fetching messages for discussion ${typeName}/${typeId}: ${
                            response.status
                        }`
                    );
                }
            })
            .then(messages =>
                dispatch(receiveMessages(typeName, typeId, messages))
            )
            .catch(error =>
                dispatch(receiveMessagesError(typeName, typeId, error))
            );
    };
}

export function requestMessages(typeName: string, typeId: string) {
    return {
        type: actionTypes.REQUEST_MESSAGES,
        typeName,
        typeId
    };
}

export function receiveMessages(
    typeName: string,
    typeId: string,
    messages: string
) {
    return {
        type: actionTypes.RECEIVE_MESSAGES,
        typeName,
        typeId,
        messages
    };
}

export function receiveMessagesError(
    typeName: string,
    typeId: string,
    error: string
) {
    return {
        type: actionTypes.RECEIVE_MESSAGES_ERROR,
        typeName,
        typeId,
        error
    };
}

export function sendNewMessage(
    typeName: string,
    typeId: string,
    message: string,
    user: Object
) {
    return (dispatch: Dispatch, getState: GetState) => {
        dispatch(sendMessage(typeName, typeId, message, user));

        return fetch(
            config.discussionsApiUrl + `linked/${typeName}/${typeId}/messages`,
            {
                method: "POST",
                credentials: "include",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(message)
            }
        )
            .then(response => {
                if (response.status === 201) {
                    return response.json();
                } else {
                    throw new Error(
                        `Error when sending message ${JSON.stringify(
                            message
                        )} for ${typeName} ${typeId}: ${response.status}`
                    );
                }
            })
            .then(messages =>
                dispatch(receiveMessages(typeName, typeId, messages))
            )
            .catch(error =>
                dispatch(sendMessageError(typeName, typeId, error))
            );
    };
}

export function sendMessage(
    typeName: string,
    typeId: string,
    message: string,
    user: Object
) {
    return {
        type: actionTypes.SEND_MESSAGE,
        typeName,
        typeId,
        message,
        user
    };
}

export function sendMessageError(
    typeName: string,
    typeId: string,
    error: string
) {
    return {
        type: actionTypes.SEND_MESSAGE_ERROR,
        typeName,
        typeId,
        error
    };
}

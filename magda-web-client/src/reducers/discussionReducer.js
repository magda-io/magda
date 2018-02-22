const initialData = {
    discussions: {}
    // discussionsForType: {}
};

// function mergeIntoDiscussionsForType(state, action, newValue) {
//   return {
//     ...state,
//     discussionsForType: {
//       ...state.discussionsForType,
//       [action.typeName]: {
//         ...state.discussionsForType[action.typeName],
//         [action.typeId]: newValue
//       }
//     }
//   };
// }

function getKey({ typeName, typeId }) {
    return typeName + "|" + typeId;
}

function mergeIntoDiscussions(state, action, newValue) {
    return {
        ...state,
        discussions: {
            ...state.discussions,
            [getKey(action)]: {
                ...(state.discussions[getKey(action)] || {}),
                ...newValue
            }
        }
    };
}

const discussionMapping = (state = initialData, action: Action) => {
    switch (action.type) {
        // case "REQUEST_DISCUSSION_FOR_TYPE":
        //   return mergeIntoDiscussionsForType(state, action, {
        //     loading: true
        //   });
        // case "RECEIVE_DISCUSSION_FOR_TYPE":
        //   return mergeIntoDiscussionsForType(state, action, {
        //     ...action.discussion,
        //     loading: false
        //   });
        // case "RECEIVE_DISCUSSION_FOR_TYPE_ERROR":
        //   return mergeIntoDiscussionsForType(state, action, {
        //     error: action.error
        //   });
        case "REQUEST_MESSAGES":
            return mergeIntoDiscussions(state, action, {
                loading: true,
                error: null
            });
        case "RECEIVE_MESSAGES":
            return mergeIntoDiscussions(state, action, {
                messages: action.messages,
                loading: false
            });
        case "RECEIVE_MESSAGES_ERROR":
            return mergeIntoDiscussions(state, action, {
                error: action.error,
                loading: false
            });
        case "SEND_MESSAGE":
            return mergeIntoDiscussions(state, action, {
                messages: (
                    state.discussions[getKey(action)].messages || []
                ).concat([
                    {
                        message: action.message,
                        user: action.user
                    }
                ]),
                loading: true
            });
        case "SEND_MESSAGE_ERROR":
            const messages = state.discussions[getKey(action)].messages || [];

            return mergeIntoDiscussions(state, action, {
                messages: messages.length
                    ? messages.slice(0, messages.length - 1)
                    : [],
                error: state.error,
                loading: false
            });
        default:
            return state;
    }
};
export default discussionMapping;

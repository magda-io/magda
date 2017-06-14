const initialData = {
  discussions: {},
  discussionsForType: {}
};

function mergeIntoDiscussionsForType(state, action, newValue) {
  return {
    ...state,
    discussionsForType: {
      ...state.discussionsForType,
      [action.typeName]: {
        ...state.discussionsForType[action.typeName],
        [action.typeId]: newValue
      }
    }
  };
}

const discussionMapping = (state = initialData, action: Action) => {
  switch (action.type) {
    case "REQUEST_DISCUSSION_FOR_TYPE":
      return mergeIntoDiscussionsForType(state, action, {
        loading: true
      });
    case "RECEIVE_DISCUSSION_FOR_TYPE":
      return mergeIntoDiscussionsForType(state, action, {
        ...action.discussion,
        loading: false
      });
    case "RECEIVE_DISCUSSION_FOR_TYPE_ERROR":
      return mergeIntoDiscussionsForType(state, action, {
        error: action.error
      });
    case "REQUEST_MESSAGES":
      return {
        ...state,
        discussions: {
          [action.discussionId]: {
            ...(state.discussions[action.discussionId] || {}),
            loading: true,
            error: null
          }
        }
      };
    case "RECEIVE_MESSAGES":
      return {
        ...state,
        discussions: {
          [action.discussionId]: {
            ...(state.discussions[action.discussionId] || {}),
            messages: action.messages,
            loading: false
          }
        }
      };
    case "RECEIVE_MESSAGES_ERROR":
      return {
        ...state,
        discussions: {
          [action.discussionId]: {
            ...(state.discussions[action.discussionId] || {}),
            error: action.error
          }
        }
      };
    // case "SEND_MESSAGE":
    //   return {
    //     ...state,
    //     discussions: {
    //       ...discussions,
    //       discussionId: {
    //         ...discussion,
    //         messages: discussion.messages.concat([message])
    //       }
    //     }
    //   };
    default:
      return state;
  }
};
export default discussionMapping;

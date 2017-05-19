import base from "../RealtimeData/Base";

const initialData = {
  user: base.auth().currentUser
};

console.log(initialData);

const userManagementMapping = (state = initialData, action: Action) => {
  switch (action.type) {
    case "SIGNED_IN":
      return Object.assign({}, state, {
        user: action.user
      });
    default:
      return state;
  }
};
export default userManagementMapping;

import { signedIn } from "../actions/userManagementActions";
import base from "./Base";

export default function setupUserManagement(store) {
  const unsubscribeOnAuthChanged = base.auth().onAuthStateChanged(user => {
    if (user) {
      console.log("signing in");
      store.dispatch(signedIn(user));
    } else {
      this.setState({ user: null });
    }
  });
}

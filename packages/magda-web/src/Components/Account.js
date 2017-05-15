import React from "react";
import "./Account.css";
import firebaseui from "firebaseui";
import "firebaseui/dist/firebaseui.css";
import base from "../Base";

const authUi = new firebaseui.auth.AuthUI(base.auth());

export default class Account extends React.Component {
  constructor(props) {
    super(props);

    this.state = {
      user: base.auth().currentUser
    };
  }

  componentDidMount() {
    var self = this;
    var uiConfig = {
      callbacks: {
        signInSuccess: function(user) {
          if (self.props.onSignIn) {
            self.props.onSignIn(user);
          }
          return false;
        }
      },
      signInOptions: [
        base.auth.GoogleAuthProvider.PROVIDER_ID,
        base.auth.EmailAuthProvider.PROVIDER_ID
      ]
    };

    this.unsubscribeOnAuthChanged = base.auth().onAuthStateChanged(user => {
      console.log(arguments);

      if (user) {
        this.setState({ user });
      } else {
        this.setState({ user: null });
      }
    });

    authUi.start("#firebaseui-auth", uiConfig);
  }

  componentWillUnmount() {
    authUi.reset();
    this.unsubscribeOnAuthChanged();
  }

  render() {
    return (
      <div className="container account">
        <h2>Account</h2>
        {!this.state.user && (
          <div id="firebaseui-auth" />
        )}
        {this.state.user && (
          <div>
            <p>Display Name: {this.state.user.displayName}</p>
            <p>Email: {this.state.user.email}</p>
          </div>
        )}
      </div>
    );
  }
}

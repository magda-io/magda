import React from "react";
import firebaseui from "firebaseui";
import "firebaseui/dist/firebaseui.css";
import { bindActionCreators } from "redux";
import { connect } from "react-redux";

import { signedIn } from "../../actions/userManagementActions";
import base from "../../RealtimeData/Base";

const authUi = new firebaseui.auth.AuthUI(base.auth());

class FirebaseLogin extends React.Component {
  componentDidMount() {
    var self = this;
    var uiConfig = {
      callbacks: {
        signInSuccess: user => {
          this.props.signedIn(user);
        }
      },
      signInOptions: [
        base.auth.GoogleAuthProvider.PROVIDER_ID,
        base.auth.EmailAuthProvider.PROVIDER_ID
      ]
    };

    authUi.start("#firebaseui-auth", uiConfig);
  }

  componentWillUnmount() {
    authUi.reset();
  }

  render() {
    return <div id="firebaseui-auth" />;
  }
}

function mapDispatchToProps(dispatch) {
  return bindActionCreators(
    {
      signedIn
    },
    dispatch
  );
}

function mapStateToProps(state) {
  return {};
}

export default connect(mapStateToProps, mapDispatchToProps)(FirebaseLogin);

import React from "react";
import "./Account.css";
import Login from "./Login";
import { connect } from "react-redux";
import parseQueryString from "../../helpers/parseQueryString";

class Account extends React.Component {
  constructor(props) {
    super(props);

    const params = parseQueryString(window.location.search);

    this.state = {
      signInError: params.signInError
    };
  }

  render() {
    return (
      <div className="container account">
        {!this.props.user &&
          <Login
            signInError={
              this.props.location.state && this.props.location.state.signInError
            }
          />}
        {this.props.user &&
          <div>
            <h2>Account</h2>
            <p>Display Name: {this.props.user.displayName}</p>
            <p>Email: {this.props.user.email}</p>
          </div>}
      </div>
    );
  }
}

function mapStateToProps(state) {
  let { userManagement: { user } } = state;

  return {
    user
  };
}

export default connect(mapStateToProps)(Account);

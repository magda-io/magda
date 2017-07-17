import React from "react";
import "./Account.css";
import Login from "./Login";
import { connect } from "react-redux";
import parseQueryString from "../../helpers/parseQueryString";
import { requestAuthProviders } from "../../actions/userManagementActions";
import { bindActionCreators } from "redux";

class Account extends React.Component {
  constructor(props) {
    super(props);

    const params = parseQueryString(window.location.search);

    this.state = {
      signInError: params.signInError
    };
  }

  componentDidMount() {
    this.props.requestAuthProviders();
  }

  render() {
    return (
      <div className="container account">
        {!this.props.user &&
          <Login
            signInError={
              this.props.location.state && this.props.location.state.signInError
            }
            providers={this.props.providers}
          />}
        {this.props.user &&
          <div>
            <h2>Account</h2>
            <p>
              Display Name: {this.props.user.displayName}
            </p>
            <p>
              Email: {this.props.user.email}
            </p>
          </div>}
      </div>
    );
  }
}

function mapStateToProps(state) {
  let { userManagement: { user, providers, providersError } } = state;

  return {
    user,
    providers,
    providersError
  };
}

const mapDispatchToProps = (dispatch: Dispatch<*>) => {
  return bindActionCreators(
    {
      requestAuthProviders
    },
    dispatch
  );
};

export default connect(mapStateToProps, mapDispatchToProps)(Account);

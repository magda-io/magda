import React from "react";
import { connect } from "react-redux";
import { Link } from "react-router";
import { bindActionCreators } from "redux";
import { requestSignOut } from "../../actions/userManagementActions";

class AccountNavBar extends React.Component {
  signOut() {
    this.props.requestSignOut();
  }

  render() {
    return (
      <ul className="nav navbar-nav navbar-account">
        {this.props.user
          ? [
              <li>
                <Link to={`/account`}>
                  {this.props.user.displayName}
                </Link>
              </li>,
              <li>
                <a href="#1" onClick={this.signOut.bind(this)}>
                  Sign Out
                </a>
              </li>
            ]
          : <li>
              <Link to={`/account/sign-in`}>Sign in</Link>
            </li>}
      </ul>
    );
  }
}

function mapStateToProps(state) {
  let { userManagement } = state;

  return {
    user: userManagement.user
  };
}

const mapDispatchToProps = (dispatch: Dispatch<*>) => {
  return bindActionCreators(
    {
      requestSignOut
    },
    dispatch
  );
};

export default connect(mapStateToProps, mapDispatchToProps)(AccountNavBar);

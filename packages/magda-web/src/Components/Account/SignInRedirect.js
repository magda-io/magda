import React from "react";
import { bindActionCreators } from "redux";
import { connect } from "react-redux";
import { signedIn } from "../../actions/userManagementActions";

// TODO: Get rid of this when we move to proper HTML5 urls.
const getParams = query => {
  if (!query) {
    return {};
  }

  return (/^[?#]/.test(query) ? query.slice(1) : query)
    .split("&")
    .reduce((params, param) => {
      let [key, value] = param.split("=");
      params[key] = value ? decodeURIComponent(value.replace(/\+/g, " ")) : "";
      return params;
    }, {});
};

export default class SignInRedirect extends React.Component {
  constructor(props) {
    super(props);

    const qs = getParams(window.location.search);

    this.state = {};
  }

  render() {
    return (
      <div className="container account">
        <h2>Account</h2>

      </div>
    );
  }
}


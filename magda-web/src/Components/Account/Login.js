import React from "react";
import { browserHistory } from "react-router";

import { config } from "../../config";
const { apiHost: baseUrl } = config;

export default class Login extends React.Component {
  render() {
    const { pathname: prevPath } =
      browserHistory.lastLocation || browserHistory.getCurrentLocation();

    const baseRedirectUrl = `${window.location.protocol}//${window.location
      .host}`;
    const oauthRedirect = `${baseRedirectUrl}/sign-in-redirect?redirectTo=${prevPath}`;

    const makeLoginUrl = type =>
      `${baseUrl}auth/login/${type}?redirect=${encodeURIComponent(
        oauthRedirect
      )}`;

    return (
      <div>
        {this.props.signInError &&
          <div>
            Sign In Failed: {this.props.signInError}
          </div>}
        <div>
          <a href={makeLoginUrl("facebook")}>
            Login with Facebook
          </a>
        </div>
        <div>
          <a href={makeLoginUrl("google")}>
            Login with Google
          </a>
        </div>
        <div>
          Login with CKAN
          <form action={makeLoginUrl("ckan")} method="post">
            <input type="text" name="username" /><br />
            <input type="password" name="password" /><br />
            <input type="submit" />
          </form>
        </div>
      </div>
    );
  }
}

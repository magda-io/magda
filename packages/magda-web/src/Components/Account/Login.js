import React from "react";

import { config } from "../../config";
const { apiHost: baseUrl } = config;

export default class Login extends React.Component {
  render() {
    // FIXME: Make this less hacky.
    const rawRedirectUrl = window.location.href.replace(
      "sign-in",
      "sign-in-redirect"
    );
    const makeLoginUrl = type =>
      `${baseUrl}auth/login/${type}?redirect=${encodeURIComponent(
        rawRedirectUrl
      )}`;

    return (
      <div>
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

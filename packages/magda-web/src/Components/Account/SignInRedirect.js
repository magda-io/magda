import React from "react";

import { browserHistory } from "react-router";

import parseQueryString from "../../helpers/parseQueryString";

export default function signInRedirect() {
  const params = parseQueryString(window.location.search);

  if (params.result === "success") {
    browserHistory.replace(params.redirectTo || "/");
  } else {
    browserHistory.replace({
      pathname: "/account",
      state: { signInError: params.errorMessage }
    });
  }
}

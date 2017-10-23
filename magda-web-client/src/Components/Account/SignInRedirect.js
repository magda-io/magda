import qs from "qs";
import React from "react";
import {
  Redirect,
} from 'react-router-dom'


export default function signInRedirect(props) {
  const params = qs.parse(window.location.search);
  if (params.result === "success") {
    return (
        <Redirect to={params.redirectTo || "/"}/>
      )
  }
  return <Redirect to={{
          pathname: '/account',
          state: { signInError: params.errorMessage }
        }}/>
}

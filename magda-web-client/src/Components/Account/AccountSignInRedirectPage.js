import React from "react";
import { Redirect } from "react-router-dom";
import queryString from "query-string";

export default function signInRedirect(props) {
    const params = queryString.parse(window.location.search, {
        ignoreQueryPrefix: true
    });
    if (params.result === "success") {
        return <Redirect to={params.redirectTo || "/account"} />;
    }
    return (
        <Redirect
            to={{
                pathname: "/account",
                state: { signInError: params.errorMessage }
            }}
        />
    );
}

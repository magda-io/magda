import React, { FunctionComponent } from "react";
import { Redirect, useLocation } from "react-router-dom";
import queryString from "query-string";

const AccountSignInRedirectPage: FunctionComponent<Record<
    string,
    any
>> = () => {
    const location = useLocation();
    const params = queryString.parse(location.search);
    const result = location.state
        ? {
              ...(location?.state && typeof location.state === "object"
                  ? location.state
                  : {}),
              ...params
          }
        : { ...params };

    if (result.result === "success") {
        return <Redirect to={result.redirectTo || "/account"} />;
    }
    return (
        <Redirect
            to={{
                pathname: "/account",
                state: {
                    signInError: params.errorMessage,
                    redirectTo: result?.redirectTo
                }
            }}
        />
    );
};

export default AccountSignInRedirectPage;

import React, { FunctionComponent } from "react";
import { Redirect, useLocation } from "react-router-dom";
import Loader from "rsuite/Loader";
import { ANONYMOUS_USERS_ROLE_ID } from "@magda/typescript-common/dist/authorization-api/constants";
import { requestSignOut } from "../actions/userManagementActions";
import { useAsync } from "react-async-hook";
import { useDispatch } from "react-redux";
import { whoami } from "api-clients/AuthApis";

const RequireLoggedIn: FunctionComponent = (props) => {
    const dispatch = useDispatch();
    const location = useLocation();
    const { pathname } = location;
    const {
        result: shouldRedirectToLoginPage,
        loading
    } = useAsync(async () => {
        try {
            const user = await whoami();
            if (
                user?.roles?.length === 1 &&
                user.roles[0]?.id === ANONYMOUS_USERS_ROLE_ID
            ) {
                dispatch(requestSignOut());
                // ANONYMOUS USERS should be redirected to login page
                return true;
            }
            return false;
        } catch (e) {
            dispatch(requestSignOut());
            // when failed to retrieve user account info, redirect user
            return true;
        }
    }, [pathname]);

    return !loading && shouldRedirectToLoginPage ? (
        <>
            <Loader content="redirecting..." />
            <Redirect
                to={{
                    pathname: "/account",
                    state: {
                        signingOff: true,
                        signInError: `You need to login to access "${location.pathname}". Please login and try again.`
                    }
                }}
            />
        </>
    ) : null;
};

export default RequireLoggedIn;

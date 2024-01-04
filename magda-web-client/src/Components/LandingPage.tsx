import React, { FunctionComponent, useMemo } from "react";
import { Redirect } from "react-router-dom";
import { useSelector } from "react-redux";
import { UserManagementState } from "reducers/userManagementReducer";
import Loader from "rsuite/Loader";
import { StateType } from "reducers/reducer";
import { ANONYMOUS_USERS_ROLE_ID } from "@magda/typescript-common/dist/authorization-api/constants.js";
import { config } from "../config";

type PropsType = {};

const LandingPage: FunctionComponent<PropsType> = (props) => {
    const {
        user,
        isFetchingWhoAmI: isUserLoading,
        whoAmIError: userLoadingError
    } = useSelector<StateType, UserManagementState>(
        (state) => state.userManagement
    );

    const isAnonymousUser = !!user?.roles?.find(
        (r) => r.id === ANONYMOUS_USERS_ROLE_ID
    );

    if (isUserLoading) {
        return (
            <Loader
                content="Loading..."
                style={{ position: "absolute", zIndex: 1 }}
            />
        );
    }

    const errorMessage = userLoadingError
        ? "Failed to fetch the user data. Please sign-in and try again."
        : null;

    if (errorMessage) {
        return (
            <Redirect
                to={{
                    pathname: "/sign-in-redirect",
                    search: `?result=failure${
                        errorMessage
                            ? `&errorMessage=${encodeURIComponent(
                                  errorMessage
                              )}`
                            : ""
                    }`
                }}
            />
        );
    }

    const landingUri = isAnonymousUser
        ? config?.anonymousUserLandingPage
        : config?.authenticatedUserLandingPage;

    return <Redirect to={landingUri} />;
};

export default LandingPage;

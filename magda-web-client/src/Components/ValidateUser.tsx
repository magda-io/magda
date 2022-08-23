import React from "react";
import { Redirect } from "react-router-dom";
import { useSelector } from "react-redux";
import { useLocation } from "react-router-dom";
import { StateType } from "reducers/reducer";
import { User } from "reducers/userManagementReducer";
import Loading from "Components/Common/Loading";

type PropsType = {
    checkUserFunc?: (user: User) => boolean;
    /**
     * ValidateUser will redirect users to the original landing url after the re-authentication.
     * If you want to redirect them to a different url rather than the original landing url, you can supply the mapping here.
     * The `key` of the object is the original landing url, the `value` is the new redirect url.
     */
    redirectMappings?: {
        [from: string]: string;
    };
    children?: JSX.Element;
};

const defaultUserChecker = (user: User) => !!user?.id;
const exemptPaths = ["/sign-in-redirect", "/account"];

function ValidateUser(props: PropsType) {
    const checkUserFunc = props?.checkUserFunc
        ? props.checkUserFunc
        : defaultUserChecker;
    const location = useLocation();
    const user = useSelector<StateType, User>(
        (state) => state?.userManagement?.user
    );
    const isUserLoading = useSelector<StateType, boolean>(
        (state) => state?.userManagement?.isFetchingWhoAmI
    );
    const userLoadingError = useSelector<StateType, Error | null>(
        (state) => state?.userManagement?.whoAmIError
    );

    if (isUserLoading) {
        return <Loading />;
    }

    if (exemptPaths.indexOf(location.pathname) !== -1) {
        return props?.children ? props?.children : null;
    }

    const errorMessage = userLoadingError
        ? "Failed to fetch the user data. Please sign-in and try again."
        : checkUserFunc(user)
        ? null
        : location.pathname === "/"
        ? ""
        : `You don't have permission to access "${location.pathname}". Please sign-in with an account with sufficient permission and try again.`;

    if (errorMessage !== null) {
        const redirectMappings = props?.redirectMappings
            ? props.redirectMappings
            : {};
        const pathname = redirectMappings[location.pathname]
            ? redirectMappings[location.pathname]
            : location.pathname;
        const redirectTo = pathname + location.search + location.hash;
        return (
            <Redirect
                to={{
                    pathname: "/sign-in-redirect",
                    search: `?result=failure${
                        redirectTo
                            ? `&redirectTo=${encodeURIComponent(redirectTo)}`
                            : ""
                    }${
                        errorMessage
                            ? `&errorMessage=${encodeURIComponent(
                                  errorMessage
                              )}`
                            : ""
                    }`
                }}
            />
        );
    } else {
        return props?.children ? props?.children : null;
    }
}

export default ValidateUser;

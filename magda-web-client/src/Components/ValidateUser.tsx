import React, { FunctionComponent, useMemo } from "react";
import { Redirect, useLocation } from "react-router-dom";
import { useSelector } from "react-redux";
import { User, UserManagementState } from "reducers/userManagementReducer";
import Loader from "rsuite/Loader";
import { StateType } from "reducers/reducer";

type CheckUserFuncType = (user: User) => boolean;

type PropsType = {
    checkUserFunc?: CheckUserFuncType;
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

const ValidateUser: FunctionComponent<PropsType> = (props) => {
    const checkUserFunc = props?.checkUserFunc
        ? props.checkUserFunc
        : defaultUserChecker;

    const location = useLocation();
    const { pathname } = location;

    const userMgtData = useSelector<StateType, UserManagementState>(
        (state) => state.userManagement
    );

    const {
        result: checkResult,
        loading: isWhoAmILoading,
        error: whoAmIError
    } = useMemo(() => {
        try {
            const userData = userMgtData.user;
            const result = checkUserFunc(userData);
            return {
                result,
                loading: userMgtData.isFetchingWhoAmI,
                error: userMgtData.whoAmIError
            };
        } catch (e) {
            return { result: undefined, loading: false, error: e };
        }
    }, [userMgtData, pathname, checkUserFunc]);

    if (isWhoAmILoading) {
        return (
            <Loader
                content="Loading..."
                style={{ position: "absolute", zIndex: 1 }}
            />
        );
    }

    if (exemptPaths.indexOf(location.pathname) !== -1) {
        return props?.children ? props?.children : null;
    }

    const errorMessage = whoAmIError
        ? "Failed to fetch the user data. Please sign-in and try again."
        : checkResult
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
};

export default ValidateUser;

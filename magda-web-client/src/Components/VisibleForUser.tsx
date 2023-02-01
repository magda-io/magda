import React, { FunctionComponent, useMemo } from "react";
import { useSelector } from "react-redux";
import { User, UserManagementState } from "reducers/userManagementReducer";
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

const VisibleForUser: FunctionComponent<PropsType> = (props) => {
    const checkUserFunc = props?.checkUserFunc
        ? props.checkUserFunc
        : defaultUserChecker;

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
    }, [userMgtData, checkUserFunc]);

    if (isWhoAmILoading || whoAmIError || !checkResult) {
        return null;
    }

    return props?.children ? props?.children : null;
};

export default VisibleForUser;

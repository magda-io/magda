import React from "react";
import memoize from "lodash/memoize";
import { ADMIN_ROLE_ID } from "../config";
import ValidateUser from "./ValidateUser";
import { User } from "reducers/userManagementReducer";

export function isAdmin(user: User) {
    return (
        !!user?.id &&
        user?.roles?.findIndex((role) => role.id === ADMIN_ROLE_ID) !== -1
    );
}

function RequireAdmin(WrappedComponent) {
    const NewComponent = (props) => (
        <ValidateUser checkUserFunc={isAdmin}>
            <WrappedComponent {...props} />
        </ValidateUser>
    );
    return NewComponent;
}

export default memoize(RequireAdmin);

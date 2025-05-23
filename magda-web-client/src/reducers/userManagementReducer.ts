import { Action } from "../types";
import { Permission } from "@magda/typescript-common/dist/authorization-api/model";
import { ANONYMOUS_USERS_ROLE_ID } from "@magda/typescript-common/dist/authorization-api/constants.js";

export type Role = {
    id: string;
    name: string;
    description: string;
    permissionIds: string[];
};

export type User = {
    id: string;
    displayName: string;
    email: string;
    photoURL: string;
    source: string;
    sourceId?: string;
    roles: Role[];
    permissions: Permission[];
    orgUnitId?: string;
    orgUnit?: OrgUnit;
    managingOrgUnitIds?: string[];
};

export type OrgUnit = {
    id: string;
    name: string;
    description: string;
    left?: number;
    right?: number;
    create_by?: string;
    create_time?: string;
    edit_by?: string;
    edit_time?: string;
};

const defaultUserInfo: User = {
    id: "",
    displayName: "Anonymous User",
    email: "",
    photoURL: "",
    source: "",
    roles: [
        {
            id: ANONYMOUS_USERS_ROLE_ID,
            name: "Anonymous Users",
            description: "Default role for unauthenticated users",
            permissionIds: []
        }
    ],
    permissions: []
};

export type UserManagementState = {
    user: User;
    isFetchingWhoAmI: boolean;
    whoAmIError: Error | null;
    isSigningOut: boolean;
};

const initialData: UserManagementState = {
    user: { ...defaultUserInfo },
    isFetchingWhoAmI: false,
    whoAmIError: null,
    isSigningOut: false
};

const userManagementMapping = (
    state: UserManagementState = initialData,
    action: Action
): UserManagementState => {
    switch (action.type) {
        case "REQUEST_WHO_AM_I":
            return Object.assign({}, state, {
                isFetchingWhoAmI: true,
                whoAmIError: null
            });
        case "RECEIVE_WHO_AM_I_USER_INFO":
            return Object.assign({}, state, {
                isFetchingWhoAmI: false,
                whoAmIError: null,
                user: action.user
            });
        case "RECEIVE_WHO_AM_I_ERROR":
            return Object.assign({}, state, {
                isFetchingWhoAmI: false,
                whoAmIError: action.err,
                user: { ...defaultUserInfo }
            });
        case "REQUEST_SIGN_OUT":
            return Object.assign({}, state, {
                isSigningOut: true
            });
        case "COMPLETED_SIGN_OUT":
            return Object.assign({}, state, {
                isSigningOut: false,
                user: { ...defaultUserInfo }
            });
        case "SIGN_OUT_ERROR":
            return Object.assign({}, state, {
                isSigningOut: false,
                signOutError: action.error
            });
        default:
            return state;
    }
};
export default userManagementMapping;

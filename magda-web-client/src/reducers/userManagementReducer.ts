import { Action } from "../types";

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
    isAdmin: boolean;
    roles: Role[];
    permissions: any[];
    orgUnitId?: string;
};

const defaultUserInfo: User = {
    id: "",
    displayName: "Anonymous User",
    email: "",
    photoURL: "",
    source: "",
    isAdmin: false,
    roles: [
        {
            id: "00000000-0000-0001-0000-000000000000",
            name: "Anonymous Users",
            description: "Default role for unauthenticated users",
            permissionIds: []
        }
    ],
    permissions: []
};

type UserManagementState = {
    user: User;
    isFetchingWhoAmI: boolean;
    whoAmIError: Error | null;
    providers: any[];
    isFetchingProviders: boolean;
    providersError?: Error | null;
};

const initialData: UserManagementState = {
    user: { ...defaultUserInfo },
    isFetchingWhoAmI: false,
    whoAmIError: null,
    providers: [],
    isFetchingProviders: false,
    providersError: null
};

const userManagementMapping = (
    state: UserManagementState = initialData,
    action: Action
) => {
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
        case "REQUEST_AUTH_PROVIDERS":
            return Object.assign({}, state, {
                isFetchingProviders: true,
                providersError: null
            });
        case "RECEIVE_AUTH_PROVIDERS":
            return Object.assign({}, state, {
                isFetchingProviders: false,
                providersError: null,
                providers: action.providers
            });
        case "RECEIVE_AUTH_PROVIDERS_ERROR":
            return Object.assign({}, state, {
                isFetchingProviders: false,
                providersError: action.err,
                providers: initialData.providers
            });
        default:
            return state;
    }
};
export default userManagementMapping;

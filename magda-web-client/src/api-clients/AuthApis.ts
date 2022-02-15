import { config, ADMIN_ROLE_ID } from "config";
import request from "helpers/request";
import getRequestNoCache from "helpers/getRequestNoCache";
import { AuthPluginConfig } from "@magda/gateway/src/createAuthPluginRouter";
import urijs from "urijs";
import { User, Role } from "reducers/userManagementReducer";

export type AuthConfig =
    | {
          isAuthPlugin: false;
          config: string;
      }
    | {
          isAuthPlugin: true;
          config: AuthPluginConfig;
      };

export type QrCodeImgDataResponse = {
    token: string;
    data: string;
};

export type QrCodePollResponse = {
    result: "pending" | "success" | "failure";
    errorMessage: string;
};

export async function getAuthProviders(): Promise<string[]> {
    const providers = await request("GET", `${config.baseUrl}auth/providers`);
    if (providers) {
        return providers;
    } else {
        return [];
    }
}

export async function getAuthPlugins(): Promise<AuthPluginConfig[]> {
    const plugins = await request("GET", `${config.baseUrl}auth/plugins`);
    if (plugins) {
        return plugins;
    } else {
        return [];
    }
}

export function convertAuthPluginApiUrl(
    pluginKey: string,
    apiUrl: string,
    optionalQueries?: { [key: string]: string }
): string {
    const uri = urijs(apiUrl);
    if (uri.hostname()) {
        // --- absolute url, return directly
        return apiUrl;
    } else {
        const baseUri = urijs(config.baseUrl);
        const query = uri.search(true);
        const apiUri = baseUri.segmentCoded(
            baseUri
                .segmentCoded()
                .concat(["auth", "login", "plugin", pluginKey])
                .concat(uri.segmentCoded())
        );

        return apiUri
            .search({
                ...(optionalQueries ? optionalQueries : {}),
                ...(query ? query : {})
            })
            .toString();
    }
}

export async function getUsers(): Promise<User[]> {
    return await getRequestNoCache<User[]>(config.authApiUrl + "users/all");
}

/**
 * Update user info by userId. Admin access only.
 * Try to update invalid field will receive 500 error.
 * @param userId
 * @param updates
 */
export async function updateUser(
    userId: string,
    updates: { [key: string]: any }
) {
    return await request<{ result: "SUCCESS" }>(
        "PUT",
        config.authApiUrl + "users/" + userId,
        updates,
        "application/json"
    );
}

export async function getUserRoles(userId: string): Promise<Role[]> {
    return await getRequestNoCache<Role[]>(
        `${config.authApiUrl}user/${userId}/roles`
    );
}

export async function addUserRoles(
    userId: string,
    roleIds: string[]
): Promise<string[]> {
    if (!roleIds?.length) {
        throw new Error("roleIds cannot be empty!");
    }
    if (!userId) {
        throw new Error("userId cannot be empty!");
    }
    return await request<string[]>(
        "post",
        `${config.authApiUrl}user/${userId}/roles`,
        roleIds,
        "application/json"
    );
}

export async function deleteUserRoles(
    userId: string,
    roleIds: string[]
): Promise<string[]> {
    if (!roleIds?.length) {
        throw new Error("roleIds cannot be empty!");
    }
    if (!userId) {
        throw new Error("userId cannot be empty!");
    }
    return await request<string[]>(
        "delete",
        `${config.authApiUrl}user/${userId}/roles`,
        roleIds,
        "application/json"
    );
}

/**
 * Set a user (specified by user id) to an admin or not (as indicated by isAdmin parameter).
 * when set user to Admin, this function will make sure both (vice versa):
 * - `isAdmin` field of user table is set to `true`
 * - AND an admin role is added to user
 * @param userId
 * @param isAdmin
 */
export async function setAdmin(userId: string, isAdmin: boolean) {
    // this API won't return role info. Only basic user info
    const user = await getRequestNoCache<User>(
        `${config.authApiUrl}users/${userId}`
    );

    const roles = await getUserRoles(userId);
    const existingAdminRoleIdx: number | undefined = roles?.length
        ? roles.findIndex((item) => item.id === ADMIN_ROLE_ID)
        : -1;
    const hasAdminRole = existingAdminRoleIdx !== -1;

    const isUserAdmin = user.isAdmin && hasAdminRole;

    if (isUserAdmin === isAdmin) {
        return;
    }

    if (user.isAdmin !== isAdmin) {
        // updating `isAdmin` field is required
        await updateUser(userId, { isAdmin });
    }

    if (isAdmin !== hasAdminRole) {
        if (isAdmin) {
            // add an admin role
            await addUserRoles(userId, [ADMIN_ROLE_ID]);
        } else if (!isAdmin) {
            // remove the admin role
            await deleteUserRoles(userId, [ADMIN_ROLE_ID]);
        }
    }
}

export type QueryUsersParams = {
    keyword?: string;
    id?: string;
    source?: string;
    orgUnitId?: string;
    sourceId?: string;
    offset?: number;
    limit?: number;
    noCache?: boolean;
};

export type UserRecord = {
    id: string;
    displayName: string;
    email: string;
    photoURL: string;
    source: string;
    sourceId: string;
    orgUnitId: string;
};

export async function queryUsers(
    params?: QueryUsersParams
): Promise<UserRecord[]> {
    const { noCache, ...queryParams } = params
        ? params
        : ({} as QueryUsersParams);
    const endpointUrl = urijs(`${config.authApiUrl}users`)
        .search(queryParams as { [key: string]: any })
        .toString();
    if (noCache === true) {
        return await getRequestNoCache<UserRecord[]>(endpointUrl);
    } else {
        return await request<UserRecord[]>("GET", endpointUrl);
    }
}

export type QueryRolesParams = {
    keyword?: string;
    id?: string;
    user_id?: string;
    owner_id?: string;
    create_by?: string;
    edit_by?: string;
    offset?: number;
    limit?: number;
    noCache?: boolean;
};

export type RoleRecord = {
    id: string;
    name: string;
    description: string;
    owner_id: string;
    is_adhoc: boolean;
    create_by: string;
    create_time: Date;
    edit_by: string;
    edit_time: Date;
};

export async function queryRoles(
    params?: QueryRolesParams
): Promise<RoleRecord[]> {
    const { noCache, ...queryParams } = params
        ? params
        : ({} as QueryRolesParams);
    const endpointUrl = urijs(`${config.authApiUrl}roles`)
        .search(queryParams as { [key: string]: any })
        .toString();
    if (noCache === true) {
        return await getRequestNoCache<RoleRecord[]>(endpointUrl);
    } else {
        return await request<RoleRecord[]>("GET", endpointUrl);
    }
}

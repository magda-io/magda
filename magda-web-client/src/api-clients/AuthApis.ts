import { config, ADMIN_ROLE_ID } from "config";
import request from "helpers/request";
import getRequest from "helpers/getRequest";
import getAbsoluteUrl from "@magda/typescript-common/dist/getAbsoluteUrl";
import { AuthPluginConfig } from "@magda/authentication-plugin-sdk";
import urijs from "urijs";
import { User, Role } from "reducers/userManagementReducer";
import {
    PermissionRecord,
    CreateRolePermissionInputData,
    OperationRecord,
    ResourceRecord
} from "@magda/typescript-common/dist/authorization-api/model";
import { Record } from "./RegistryApis";
import ServerError from "@magda/typescript-common/dist/ServerError";
import { v4 as isUuid } from "is-uuid";

export type QrCodeImgDataResponse = {
    token: string;
    data: string;
};

export type QrCodePollResponse = {
    result: "pending" | "success" | "failure";
    errorMessage: string;
};

export async function getAuthPlugins(): Promise<AuthPluginConfig[]> {
    const plugins = await request(
        "GET",
        getAbsoluteUrl(`auth/plugins`, config.baseUrl)
    );
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
    return await getRequest<User[]>(
        getAbsoluteUrl("users/all", config.authApiUrl),
        true
    );
}

export async function getUserById(
    userId: string,
    noCache = false
): Promise<User> {
    return await getRequest<User>(
        getAbsoluteUrl(
            `users/${encodeURIComponent(userId)}`,
            config.authApiUrl
        ),
        noCache
    );
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
        getAbsoluteUrl(
            "users/" + encodeURIComponent(userId),
            config.authApiUrl
        ),
        updates,
        "application/json"
    );
}

export async function getUserRoles(userId: string): Promise<Role[]> {
    return await getRequest<Role[]>(
        getAbsoluteUrl(
            `user/${encodeURIComponent(userId)}/roles`,
            config.authApiUrl
        ),
        true
    );
}

/**
 * Assign a list of roles to the user
 *
 * @export
 * @param {string} userId the user ID
 * @param {string[]} roleIds a list of roles' ID
 * @return {*}  {Promise<string[]>} return a list of role IDs
 */
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
        getAbsoluteUrl(
            `users/${encodeURIComponent(userId)}/roles`,
            config.authApiUrl
        ),
        roleIds
    );
}

/**
 * Remove a list of roles from the user
 *
 * @export
 * @param {string} userId
 * @param {string[]} roleIds
 */
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
        getAbsoluteUrl(
            `users/${encodeURIComponent(userId)}/roles`,
            config.authApiUrl
        ),
        roleIds
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
    const user = await getRequest<User>(
        getAbsoluteUrl(
            `users/${encodeURIComponent(userId)}`,
            config.authApiUrl
        ),
        true
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

export interface UserRecord {
    id: string;
    displayName: string;
    email: string;
    photoURL: string;
    source: string;
    sourceId: string;
    orgUnitId: string;
}

export async function queryUsers(
    params?: QueryUsersParams
): Promise<UserRecord[]> {
    const { noCache, ...queryParams } = params
        ? params
        : ({} as QueryUsersParams);

    return await getRequest<UserRecord[]>(
        getAbsoluteUrl(`users`, config.authApiUrl, queryParams),
        noCache
    );
}

export type QueryUsersCountParams = Omit<QueryUsersParams, "offset" | "limit">;

export async function queryUsersCount(
    params?: QueryUsersCountParams
): Promise<number> {
    const { noCache, ...queryParams } = params
        ? params
        : ({} as QueryUsersCountParams);

    const res = await getRequest<{ count: number }>(
        getAbsoluteUrl(`users/count`, config.authApiUrl, queryParams),
        noCache
    );
    return res?.count ? res.count : 0;
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

    return await getRequest<RoleRecord[]>(
        getAbsoluteUrl(`roles`, config.authApiUrl, queryParams),
        noCache
    );
}

export type QueryRolesCountParams = Omit<QueryRolesParams, "offset" | "limit">;

export async function queryRolesCount(
    params?: QueryRolesCountParams
): Promise<number> {
    const { noCache, ...queryParams } = params
        ? params
        : ({} as QueryRolesCountParams);

    const res = await getRequest<{ count: number }>(
        getAbsoluteUrl(`roles/count`, config.authApiUrl, queryParams),
        noCache
    );
    return res?.count ? res.count : 0;
}

export async function getRoleById(
    roleId: string,
    noCache = false
): Promise<RoleRecord> {
    return await getRequest<RoleRecord>(
        getAbsoluteUrl(
            `roles/${encodeURIComponent(roleId)}`,
            config.authApiUrl
        ),
        noCache
    );
}

export async function createRole(role: Partial<RoleRecord>) {
    return await request<RoleRecord>(
        "POST",
        getAbsoluteUrl(`roles`, config.authApiUrl),
        role
    );
}

export async function updateRole(roleId: string, role: Partial<RoleRecord>) {
    return await request<RoleRecord>(
        "PUT",
        getAbsoluteUrl(
            `roles/${encodeURIComponent(roleId)}`,
            config.authApiUrl
        ),
        role
    );
}

export async function deleteRole(roleId: string) {
    await request(
        "DELETE",
        getAbsoluteUrl(`roles/${encodeURIComponent(roleId)}`, config.authApiUrl)
    );
}

export async function whoami() {
    return await request<User>(
        "GET",
        getAbsoluteUrl(`users/whoami`, config.authApiUrl)
    );
}

export type QueryResourcesParams = {
    keyword?: string;
    id?: string;
    uri?: string;
    offset?: number;
    limit?: number;
    noCache?: boolean;
};

export async function queryResources(
    params?: QueryResourcesParams
): Promise<ResourceRecord[]> {
    const { noCache, ...queryParams } = params
        ? params
        : ({} as QueryRolesParams);
    return await getRequest<ResourceRecord[]>(
        getAbsoluteUrl(`resources`, config.authApiUrl, queryParams),
        noCache
    );
}

export type QueryResourcesCountParams = Omit<
    QueryResourcesParams,
    "offset" | "limit"
>;

export async function queryResourcesCount(
    params?: QueryResourcesCountParams
): Promise<number> {
    const { noCache, ...queryParams } = params
        ? params
        : ({} as QueryResourcesCountParams);
    const res = await getRequest<{ count: number }>(
        getAbsoluteUrl(`resources/count`, config.authApiUrl, queryParams),
        noCache
    );
    return res?.count ? res.count : 0;
}

export async function getResourceById(resId: string, noCache: boolean = false) {
    return await getRequest<ResourceRecord>(
        getAbsoluteUrl(
            `resources/${encodeURIComponent(resId)}`,
            config.authApiUrl
        ),
        noCache
    );
}

export async function getResourceByUri(
    resUri: string,
    noCache: boolean = false
) {
    return await getRequest<ResourceRecord>(
        getAbsoluteUrl(`resources/byUri/${resUri}`, config.authApiUrl),
        noCache
    );
}

export async function createResource(resource: Partial<ResourceRecord>) {
    return await request<ResourceRecord>(
        "POST",
        getAbsoluteUrl("resources", config.authApiUrl),
        resource
    );
}

export async function updateResource(
    resourceId: string,
    resource: Partial<ResourceRecord>
) {
    return await request<ResourceRecord>(
        "PUT",
        getAbsoluteUrl(
            `resources/${encodeURIComponent(resourceId)}`,
            config.authApiUrl
        ),
        resource
    );
}

export async function deleteResource(resourceId: string) {
    await request(
        "DELETE",
        getAbsoluteUrl(
            `resources/${encodeURIComponent(resourceId)}`,
            config.authApiUrl
        )
    );
}

export type QueryOperationsParams = {
    keyword?: string;
    uri?: string;
    offset?: number;
    limit?: number;
    noCache?: boolean;
};

export async function queryResOperations(
    resId: string,
    params?: QueryOperationsParams
): Promise<OperationRecord[]> {
    const { noCache, ...queryParams } = params
        ? params
        : ({} as QueryOperationsParams);
    return await getRequest<OperationRecord[]>(
        getAbsoluteUrl(
            `resources/${encodeURIComponent(resId)}/operations`,
            config.authApiUrl,
            queryParams
        ),
        noCache
    );
}

export type QueryOperationsCountParams = Omit<
    QueryOperationsParams,
    "offset" | "limit"
>;

export async function queryResOperationsCount(
    resId: string,
    params?: QueryOperationsCountParams
): Promise<number> {
    const { noCache, ...queryParams } = params
        ? params
        : ({} as QueryOperationsCountParams);
    const res = await getRequest<{ count: number }>(
        getAbsoluteUrl(
            `resources/${encodeURIComponent(resId)}/operations/count`,
            config.authApiUrl,
            queryParams
        ),
        noCache
    );
    return res?.count ? res.count : 0;
}

export async function getResOperationsById(
    resOperationId: string,
    noCache: boolean = false
) {
    return await getRequest<OperationRecord>(
        getAbsoluteUrl(
            `operations/${encodeURIComponent(resOperationId)}`,
            config.authApiUrl
        ),
        noCache
    );
}

export async function createOperation(
    resourceId: string,
    operation: Partial<OperationRecord>
) {
    return await request<OperationRecord>(
        "POST",
        getAbsoluteUrl(
            `resources/${encodeURIComponent(resourceId)}/operations`,
            config.authApiUrl
        ),
        operation
    );
}

export async function updateOperation(
    operationId: string,
    operation: Partial<OperationRecord>
) {
    return await request<OperationRecord>(
        "PUT",
        getAbsoluteUrl(
            `operations/${encodeURIComponent(operationId)}`,
            config.authApiUrl
        ),
        operation
    );
}

export async function deleteOperation(operationId: string) {
    await request(
        "DELETE",
        getAbsoluteUrl(
            `operations/${encodeURIComponent(operationId)}`,
            config.authApiUrl
        )
    );
}

export type QueryPermissionsParams = {
    keyword?: string;
    resource_id?: string;
    offset?: number;
    limit?: number;
    noCache?: boolean;
};

export interface RolePermissionRecord extends PermissionRecord {
    resource_uri: string;
    operations?: OperationRecord[];
}

export async function queryRolePermissions(
    resId: string,
    params?: QueryPermissionsParams
): Promise<RolePermissionRecord[]> {
    const { noCache, ...queryParams } = params
        ? params
        : ({} as QueryPermissionsParams);
    return await getRequest<RolePermissionRecord[]>(
        getAbsoluteUrl(
            `roles/${encodeURIComponent(resId)}/permissions`,
            config.authApiUrl,
            queryParams
        ),
        noCache
    );
}

export type QueryPermissionsCountParams = Omit<
    QueryPermissionsParams,
    "offset" | "limit"
>;

export async function queryRolePermissionsCount(
    resId: string,
    params?: QueryPermissionsCountParams
): Promise<number> {
    const { noCache, ...queryParams } = params
        ? params
        : ({} as QueryPermissionsCountParams);
    const res = await getRequest<{ count: number }>(
        getAbsoluteUrl(
            `roles/${encodeURIComponent(resId)}/permissions/count`,
            config.authApiUrl,
            queryParams
        ),
        noCache
    );
    return res?.count ? res.count : 0;
}

export async function createRolePermission(
    roleId: string,
    permissionData: CreateRolePermissionInputData
): Promise<PermissionRecord> {
    if (!permissionData?.operationIds?.length) {
        throw new Error("operationIds cannot be empty!");
    }
    if (!permissionData?.name) {
        throw new Error("permission name cannot be empty!");
    }
    if (!roleId) {
        throw new Error("roleId cannot be empty!");
    }
    if (!permissionData?.resource_id) {
        throw new Error("resource_id cannot be empty!");
    }
    return await request<PermissionRecord>(
        "POST",
        getAbsoluteUrl(
            `roles/${encodeURIComponent(roleId)}/permissions`,
            config.authApiUrl
        ),
        permissionData
    );
}

export async function updateRolePermission(
    roleId: string,
    permissionId: string,
    permissionData: CreateRolePermissionInputData
): Promise<PermissionRecord> {
    if (!permissionData?.operationIds?.length) {
        throw new Error("operationIds cannot be empty!");
    }
    if (!permissionData?.name) {
        throw new Error("permission name cannot be empty!");
    }
    if (!roleId) {
        throw new Error("roleId cannot be empty!");
    }
    if (!permissionId) {
        throw new Error("permissionId cannot be empty!");
    }
    if (!permissionData?.resource_id) {
        throw new Error("resource_id cannot be empty!");
    }
    return await request<PermissionRecord>(
        "PUT",
        getAbsoluteUrl(
            `roles/${encodeURIComponent(
                roleId
            )}/permissions/${encodeURIComponent(permissionId)}`,
            config.authApiUrl
        ),
        permissionData
    );
}

export async function deleteRolePermission(
    roleId: string,
    permissionId: string
) {
    if (!permissionId) {
        throw new Error("permissionId cannot be empty!");
    }
    if (!roleId) {
        throw new Error("roleId cannot be empty!");
    }
    await request<PermissionRecord>(
        "DELETE",
        getAbsoluteUrl(
            `roles/${encodeURIComponent(
                roleId
            )}/permissions/${encodeURIComponent(permissionId)}`,
            config.authApiUrl
        )
    );
}

export async function getPermissionById(
    permissionId: string,
    noCache = false
): Promise<RolePermissionRecord> {
    if (!permissionId) {
        throw new Error("Invalid empty permissionId!");
    }
    return await getRequest<RolePermissionRecord>(
        getAbsoluteUrl(
            `permissions/${encodeURIComponent(permissionId)}`,
            config.authApiUrl
        ),
        noCache
    );
}

export interface APIKeyRecord {
    id: string;
    user_id: string;
    created_timestamp: Date;
    hash: string;
    enabled: boolean;
    expiry_time?: Date;
    last_successful_attempt_time?: Date;
    last_failed_attempt_time?: Date;
}

export async function getUserApiKeys(userId: string, noCache: boolean = true) {
    if (!userId) {
        throw new Error("Invalid empty userId!");
    }
    return await getRequest<APIKeyRecord[]>(
        getAbsoluteUrl(
            `users/${encodeURIComponent(userId)}/apiKeys`,
            config.authApiUrl
        ),
        noCache
    );
}

export async function getUserApiKeyById(
    userId: string,
    apiKeyId: string,
    noCache: boolean = true
) {
    if (!userId) {
        throw new Error("Invalid empty userId!");
    }
    return await getRequest<APIKeyRecord>(
        getAbsoluteUrl(
            `users/${encodeURIComponent(userId)}/apiKeys/${encodeURIComponent(
                apiKeyId
            )}`,
            config.authApiUrl
        ),
        noCache
    );
}

export async function createUserApiKey(userId: string, expiryTime?: Date) {
    if (!userId) {
        throw new Error("Invalid empty userId!");
    }
    console.log("expiryTime: ", expiryTime);
    return await request<{ id: string; key: string }>(
        "post",
        getAbsoluteUrl(
            `users/${encodeURIComponent(userId)}/apiKeys`,
            config.authApiUrl
        ),
        { expiryTime }
    );
}

export async function updateUserApiKey(
    userId: string,
    apiKeyId: string,
    data: {
        enabled?: boolean;
        expiryTime?: Date;
    }
) {
    if (!userId) {
        throw new Error("Invalid empty userId!");
    }
    if (!apiKeyId) {
        throw new Error("Invalid empty apiKeyId!");
    }
    return await request<APIKeyRecord>(
        "put",
        getAbsoluteUrl(
            `users/${encodeURIComponent(userId)}/apiKeys/${encodeURIComponent(
                apiKeyId
            )}`,
            config.authApiUrl
        ),
        data
    );
}

export async function deleteUserApiKey(userId: string, apiKeyId: string) {
    if (!userId) {
        throw new Error("Invalid empty userId!");
    }
    if (!apiKeyId) {
        throw new Error("Invalid empty apiKeyId!");
    }
    return await request<{ deleted: boolean }>(
        "delete",
        getAbsoluteUrl(
            `users/${encodeURIComponent(userId)}/apiKeys/${encodeURIComponent(
                apiKeyId
            )}`,
            config.authApiUrl
        )
    );
}

export interface AccessGroup {
    id?: string;
    name: string;
    description?: string;
    keywords?: string[];
    resourceUri: string;
    operationUris: string[];
    roleId: string;
    permissionId: string;
    ownerId?: string | null;
    orgUnitId?: string | null;
    createTime?: string;
    createBy?: string;
    editTime?: string;
    editBy?: string;
}

export async function getAccessGroupById(
    groupId: string,
    noCache: boolean = true
): Promise<AccessGroup> {
    if (!groupId) {
        throw new ServerError("groupId cannot be empty!", 400);
    }
    const accessGroupRecord = await getRequest<Record>(
        getAbsoluteUrl(
            `records/${encodeURIComponent(groupId)}`,
            config.registryReadOnlyApiUrl,
            {
                optionalAspect: ["access-group-details", "access-control"],
                dereference: false
            }
        ),
        noCache
    );
    const accessGroupDetails =
        accessGroupRecord?.aspects?.["access-group-details"];

    if (!accessGroupDetails) {
        throw new ServerError(
            `Invalid access group record "${groupId}": cannot locate "access-group-details" aspect`,
            500
        );
    }

    const accessControls = accessGroupRecord?.aspects?.["access-control"];

    return {
        ...accessGroupDetails,
        ownerId: accessControls?.ownerId ? accessControls.ownerId : null,
        orgUnitId: accessControls?.orgUnitId ? accessControls.orgUnitId : null
    };
}

export type AccessGroupCreateData = Omit<
    AccessGroup,
    | "id"
    | "roleId"
    | "permissionId"
    | "createTime"
    | "createBy"
    | "editTime"
    | "editBy"
>;

export async function createAccessGroup(
    groupData: AccessGroupCreateData
): Promise<AccessGroup> {
    const accessGroupRecord = await request<AccessGroup>(
        "post",
        getAbsoluteUrl(`accessGroups`, config.authApiUrl),
        groupData
    );
    return accessGroupRecord;
}

export type AccessGroupUpdateData = Partial<AccessGroupCreateData>;

export async function updateAccessGroup(
    groupId: string,
    groupData: AccessGroupUpdateData
): Promise<AccessGroup> {
    const accessGroupRecord = await request<AccessGroup>(
        "put",
        getAbsoluteUrl(
            `accessGroups/${encodeURIComponent(groupId)}`,
            config.authApiUrl
        ),
        groupData
    );
    return accessGroupRecord;
}

export async function deleteAccessGroup(groupId: string) {
    if (!groupId) {
        throw new ServerError("Invalid empty access group id.", 400);
    }
    const result = await request<{ result: boolean }>(
        "delete",
        getAbsoluteUrl(
            `accessGroups/${encodeURIComponent(groupId)}`,
            config.authApiUrl
        )
    );
    return result.result;
}

export async function addDatasetToAccessGroup(
    datasetId: string,
    groupId: string
) {
    if (!groupId) {
        throw new ServerError("Invalid empty access group id.", 400);
    }
    if (!datasetId) {
        throw new ServerError("Invalid empty dataset id.", 400);
    }
    const result = await request<{ result: boolean }>(
        "post",
        getAbsoluteUrl(
            `accessGroups/${encodeURIComponent(
                groupId
            )}/datasets/${encodeURIComponent(datasetId)}`,
            config.authApiUrl
        )
    );
    return result.result;
}

export async function removeDatasetToAccessGroup(
    datasetId: string,
    groupId: string
) {
    if (!groupId) {
        throw new ServerError("Invalid empty access group id.", 400);
    }
    if (!datasetId) {
        throw new ServerError("Invalid empty dataset id.", 400);
    }
    const result = await request<{ result: boolean }>(
        "delete",
        getAbsoluteUrl(
            `accessGroups/${encodeURIComponent(
                groupId
            )}/datasets/${encodeURIComponent(datasetId)}`,
            config.authApiUrl
        )
    );
    return result.result;
}

export async function addUserToAccessGroup(userId: string, groupId: string) {
    if (!groupId) {
        throw new ServerError("Invalid empty access group id.", 400);
    }
    if (!isUuid(userId)) {
        throw new ServerError("Invalid userId: " + userId, 400);
    }
    const result = await request<{ result: boolean }>(
        "post",
        getAbsoluteUrl(
            `accessGroups/${encodeURIComponent(
                groupId
            )}/users/${encodeURIComponent(userId)}`,
            config.authApiUrl
        )
    );
    return result.result;
}

export async function removeUserToAccessGroup(userId: string, groupId: string) {
    if (!groupId) {
        throw new ServerError("Invalid empty access group id.", 400);
    }
    if (!isUuid(userId)) {
        throw new ServerError("Invalid userId: " + userId, 400);
    }
    const result = await request<{ result: boolean }>(
        "delete",
        getAbsoluteUrl(
            `accessGroups/${encodeURIComponent(
                groupId
            )}/users/${encodeURIComponent(userId)}`,
            config.authApiUrl
        )
    );
    return result.result;
}

export async function queryRoleUsers(
    roleId: string,
    params?: QueryUsersParams
): Promise<UserRecord[]> {
    const { noCache, ...queryParams } = params
        ? params
        : ({} as QueryUsersParams);

    return await getRequest<UserRecord[]>(
        getAbsoluteUrl(
            `roles/${encodeURIComponent(roleId)}/users`,
            config.authApiUrl,
            queryParams
        ),
        noCache
    );
}

export async function queryRoleUsersCount(
    roleId: string,
    params?: QueryUsersCountParams
): Promise<number> {
    const { noCache, ...queryParams } = params
        ? params
        : ({} as QueryUsersCountParams);

    const res = await getRequest<{ count: number }>(
        getAbsoluteUrl(
            `roles/${encodeURIComponent(roleId)}/users/count`,
            config.authApiUrl,
            queryParams
        ),
        noCache
    );
    return res?.count ? res.count : 0;
}

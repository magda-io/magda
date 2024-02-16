import { ADMIN_USERS_ROLE_ID } from "@magda/typescript-common/dist/authorization-api/constants.js";
import { User } from "../reducers/userManagementReducer";

export function hasPermission(operationUri: string, user?: User) {
    if (
        user?.roles?.length &&
        user.roles.findIndex((role) => role?.id === ADMIN_USERS_ROLE_ID) !== -1
    ) {
        return true;
    }
    const userPermissions = user?.permissions;
    if (!userPermissions?.length) {
        return false;
    }
    for (let i = 0; i < userPermissions.length; i++) {
        const permission = userPermissions[i];
        if (!permission?.operations?.length) {
            continue;
        }
        for (let i = 0; i < permission.operations.length; i++) {
            if (permission.operations[i]?.uri === operationUri) {
                return true;
            }
        }
    }
    return false;
}

/**
 * Given a list of required operation URIs, return a list of operation URIs that are not met when searching in a given user permission list.
 * The function will return an empty array if all required operation URIs can be found.
 *
 * @export
 * @param {string[]} [requiredOperationUris]
 * @param {User} [user]
 * @return {*}  {string[]}
 */
export function findPermissionGap(
    requiredOperationUris?: string[],
    user?: User
): string[] {
    if (!requiredOperationUris?.length) {
        throw new Error("requiredOperationUris cannot be empty!");
    }
    return requiredOperationUris.filter(
        (optUri) => !hasPermission(optUri, user)
    );
}

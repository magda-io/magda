import { ADMIN_USERS_ROLE_ID } from "@magda/typescript-common/dist/authorization-api/constants.js";
import { useSelector } from "react-redux";
import { StateType } from "reducers/reducer";
import { UserManagementState } from "reducers/userManagementReducer";
import uniq from "lodash/uniq";

function useRequirePermissions(operationUris: string[]): boolean {
    const userManagement = useSelector<StateType, UserManagementState>(
        (state) => state?.userManagement
    );
    if (userManagement?.isFetchingWhoAmI) {
        return false;
    }
    if (userManagement?.whoAmIError) {
        return false;
    }
    const roles = userManagement?.user?.roles?.length
        ? userManagement.user.roles
        : [];
    if (roles.findIndex((r) => r.id === ADMIN_USERS_ROLE_ID) !== -1) {
        // has admin role, always return true
        return true;
    }
    const permissions = userManagement?.user?.permissions?.length
        ? userManagement.user.permissions
        : [];
    const userOpUris = uniq(
        permissions.flatMap((p) =>
            p?.operations?.length ? p.operations.map((o) => o.uri) : []
        )
    );
    for (const opUri of operationUris) {
        if (userOpUris.findIndex((i) => i === opUri) !== -1) {
            return false;
        }
    }
    return true;
}

export default useRequirePermissions;

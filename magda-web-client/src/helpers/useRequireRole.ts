import { useSelector } from "react-redux";
import { StateType } from "reducers/reducer";
import { UserManagementState } from "reducers/userManagementReducer";

function useRequireRole(roleId: string): boolean {
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
    if (roles.findIndex((r) => r.id === roleId) !== -1) {
        return true;
    } else {
        return false;
    }
}

export default useRequireRole;

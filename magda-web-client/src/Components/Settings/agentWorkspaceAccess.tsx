import React from "react";
import memoize from "lodash/memoize";
import ValidateUser from "Components/ValidateUser";
import { User } from "reducers/userManagementReducer";
import { hasPermission } from "helpers/accessControlUtils";

/**
 * The single grantable operation for the current user's own Agent Workspace
 * (#3858). `whoami` permissions are only a navigation hint: Agent Manager
 * enforces the operation on every lifecycle, runtime HTTP and WebSocket call.
 */
export const AGENT_WORKSPACE_ACCESS_OPERATION = "agentWorkspace/access";

export function canAccessAgentWorkspace(user?: User) {
    return !!user?.id && hasPermission(AGENT_WORKSPACE_ACCESS_OPERATION, user);
}

function RequireAgentWorkspaceAccess(WrappedComponent) {
    const NewComponent = (props) => (
        <ValidateUser checkUserFunc={canAccessAgentWorkspace}>
            <WrappedComponent {...props} />
        </ValidateUser>
    );
    return NewComponent;
}

export const requireAgentWorkspaceAccess = memoize(RequireAgentWorkspaceAccess);

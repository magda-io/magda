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

/**
 * Typed read operations for the Agent Skills catalogue (#3854). Either one,
 * including owner/OrgUnit/pre-authorised constrained grants, makes the
 * catalogue worth showing; Agent Services filters what is actually readable.
 * Catalogue access is independent of Workspace access.
 */
export const AGENT_SKILL_READ_OPERATIONS = [
    "object/agentSkill/system/read",
    "object/agentSkill/user/read"
];

export function canAccessAgentWorkspace(user?: User) {
    return !!user?.id && hasPermission(AGENT_WORKSPACE_ACCESS_OPERATION, user);
}

export function canBrowseAgentSkills(user?: User) {
    return (
        !!user?.id &&
        AGENT_SKILL_READ_OPERATIONS.some((operation) =>
            hasPermission(operation, user)
        )
    );
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

function RequireAgentSkillsAccess(WrappedComponent) {
    const NewComponent = (props) => (
        <ValidateUser checkUserFunc={canBrowseAgentSkills}>
            <WrappedComponent {...props} />
        </ValidateUser>
    );
    return NewComponent;
}

export const requireAgentSkillsAccess = memoize(RequireAgentSkillsAccess);

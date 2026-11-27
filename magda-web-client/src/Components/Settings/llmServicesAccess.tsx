import React from "react";
import memoize from "lodash/memoize";
import ValidateUser from "Components/ValidateUser";
import { User } from "reducers/userManagementReducer";
import { ADMIN_USERS_ROLE_ID } from "@magda/typescript-common/dist/authorization-api/constants.js";

export const LLM_ACCESS_READ_OPERATION = "llm/access/read";
export const LLM_ACCESS_CREATE_OPERATION = "llm/access/create";
export const LLM_ACCESS_UPDATE_OPERATION = "llm/access/update";
export const LLM_ACCESS_DELETE_OPERATION = "llm/access/delete";
export const LLM_ACCESS_INVOKE_OPERATION = "llm/access/invoke";
export const LLM_USAGE_READ_OPERATION = "llm/usage/read";

export type LlmAccessManagementOperation =
    | typeof LLM_ACCESS_READ_OPERATION
    | typeof LLM_ACCESS_CREATE_OPERATION
    | typeof LLM_ACCESS_UPDATE_OPERATION
    | typeof LLM_ACCESS_DELETE_OPERATION
    | typeof LLM_USAGE_READ_OPERATION;

/**
 * Whether the `whoami` user could perform an `llm/access/*` management
 * operation (#3838 AUTH-3): administrators, or an **unconstrained** permission
 * (no owner, org unit or pre-authorised constraint) that includes it.
 * Constrained grants never allow management, so they don't show the pages.
 *
 * This is a navigation hint only. LLM Services makes the real decision on
 * every request.
 */
export function canManageLlmAccess(
    operationUri: LlmAccessManagementOperation,
    user?: User
): boolean {
    if (!user?.id) {
        return false;
    }
    if (user.roles?.some((role) => role?.id === ADMIN_USERS_ROLE_ID)) {
        return true;
    }
    return !!user.permissions?.some(
        (permission) =>
            !!permission &&
            !permission.userOwnershipConstraint &&
            !permission.orgUnitOwnershipConstraint &&
            !permission.preAuthorisedConstraint &&
            !!permission.operations?.some((op) => op?.uri === operationUri)
    );
}

export const canReadAccessProfiles = (user?: User) =>
    canManageLlmAccess(LLM_ACCESS_READ_OPERATION, user);

/**
 * My Usage (UI doc, Navigation): administrators, and users holding any
 * permission that includes `llm/access/invoke`, **of any constraint**. A
 * frontend check only; the API always reports the session's own user.
 */
export function canViewMyUsage(user?: User): boolean {
    if (!user?.id) {
        return false;
    }
    if (user.roles?.some((role) => role?.id === ADMIN_USERS_ROLE_ID)) {
        return true;
    }
    return !!user.permissions?.some(
        (permission) =>
            !!permission?.operations?.some(
                (op) => op?.uri === LLM_ACCESS_INVOKE_OPERATION
            )
    );
}

/** User Usage (AUTH-9): only unconstrained `llm/usage/read` is honoured. */
export const canReadUserUsage = (user?: User) =>
    canManageLlmAccess(LLM_USAGE_READ_OPERATION, user);

function RequireAccessProfilesRead(WrappedComponent) {
    const NewComponent = (props) => (
        <ValidateUser checkUserFunc={canReadAccessProfiles}>
            <WrappedComponent {...props} />
        </ValidateUser>
    );
    return NewComponent;
}

export const requireAccessProfilesRead = memoize(RequireAccessProfilesRead);

function RequireMyUsageAccess(WrappedComponent) {
    const NewComponent = (props) => (
        <ValidateUser checkUserFunc={canViewMyUsage}>
            <WrappedComponent {...props} />
        </ValidateUser>
    );
    return NewComponent;
}

export const requireMyUsageAccess = memoize(RequireMyUsageAccess);

function RequireUserUsageRead(WrappedComponent) {
    const NewComponent = (props) => (
        <ValidateUser checkUserFunc={canReadUserUsage}>
            <WrappedComponent {...props} />
        </ValidateUser>
    );
    return NewComponent;
}

export const requireUserUsageRead = memoize(RequireUserUsageRead);

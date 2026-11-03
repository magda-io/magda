package agentWorkspace

default allow = false

# `agentWorkspace/access` lets an authenticated user operate their **own**
# Agent Workspace (lifecycle, DSH runtime HTTP and WebSocket, skill-sync
# retry). Agent Manager always resolves the target Sandbox from the
# authenticated user, so this decision never names another user's Workspace.
#
# The operation URI has only two segments, so the generic
# `breakdownOperationUri` helper would derive the resource URI
# "/agentWorkspace". Match the registered resource URI directly instead.
#
# Only an unconstrained permission grants access: ownership, OrgUnit and
# pre-authorised constraints have no Workspace record to evaluate against.
allow {
    input.operationUri == "agentWorkspace/access"
    is_string(input.user.id)
    input.user.id != ""

    permission := input.user.permissions[_]
    permission.resourceUri == "agentWorkspace"
    permission.userOwnershipConstraint == false
    permission.orgUnitOwnershipConstraint == false
    permission.preAuthorisedConstraint == false
    permission.operations[_].uri == "agentWorkspace/access"
}

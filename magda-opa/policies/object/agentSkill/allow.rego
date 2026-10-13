package object.agentSkill

import data.common.hasNoConstraintPermission
import data.common.hasOwnerConstraintPermission

default allow = false

allow {
    verifyPermission(input.operationUri, "agentSkill")
}

# System skills are readable only through the dedicated unconstrained read
# permission. Mutation remains admin-only through the entrypoint's existing
# administrator short-circuit.
verifyPermission(operationUri, inputObjectRefName) {
    input.user.id
    input.object[inputObjectRefName]["agent-skill"].scope == "system"
    operationUri == "object/agentSkill/read"
    hasNoConstraintPermission(operationUri)
}

supportedUserOperation("object/agentSkill/create")
supportedUserOperation("object/agentSkill/read")
supportedUserOperation("object/agentSkill/update")
supportedUserOperation("object/agentSkill/delete")

# User-scope permissions are deliberately ownership-constrained. In particular,
# an unconstrained system-read permission must never expose another user's skill.
verifyUserPermission(operationUri, inputObjectRefName) {
    input.user.id
    supportedUserOperation(operationUri)
    input.object[inputObjectRefName]["agent-skill"].scope == "user"
    hasOwnerConstraintPermission(operationUri)
    input.object[inputObjectRefName]["access-control"].ownerId == input.user.id
}

verifyPermission(operationUri, inputObjectRefName) {
    verifyUserPermission(operationUri, inputObjectRefName)
    operationUri != "object/agentSkill/update"
}

# Registry performs one update decision against current state and one against
# proposed state. The current-state decision has no originalRecord; the proposed
# decision must preserve ownership and all immutable Agent Skill metadata.
verifyPermission("object/agentSkill/update", inputObjectRefName) {
    verifyUserPermission("object/agentSkill/update", inputObjectRefName)
    not input.object.originalRecord
}

verifyPermission("object/agentSkill/update", inputObjectRefName) {
    verifyUserPermission("object/agentSkill/update", inputObjectRefName)
    original := input.object.originalRecord
    proposed := input.object[inputObjectRefName]
    original["agent-skill"].scope == proposed["agent-skill"].scope
    original["access-control"].ownerId == proposed["access-control"].ownerId
    original["agent-skill"].createdAt == proposed["agent-skill"].createdAt
    original["agent-skill"].createdBy == proposed["agent-skill"].createdBy
    original["agent-skill"].archiveKey == proposed["agent-skill"].archiveKey
}

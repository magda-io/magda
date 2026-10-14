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

supportedUserOperation("object/agentSkill/create") = true

supportedUserOperation("object/agentSkill/read") = true

supportedUserOperation("object/agentSkill/update") = true

supportedUserOperation("object/agentSkill/delete") = true

# User-scope permissions are deliberately ownership-constrained. In particular,
# an unconstrained system-read permission must never expose another user's skill.
verifyUserPermission(operationUri, inputObjectRefName) {
	input.user.id
	supportedUserOperation(operationUri)
	input.object[inputObjectRefName]["agent-skill"].scope == "user"
	hasOwnerConstraintPermission(operationUri)
	input.object[inputObjectRefName]["access-control"].ownerId == input.user.id
}

# Registry authorizes current and proposed update states independently. Agent
# Services owns immutable name and publication-metadata validation; this policy
# remains intentionally independent of an optional originalRecord context.
verifyPermission(operationUri, inputObjectRefName) {
	verifyUserPermission(operationUri, inputObjectRefName)
}

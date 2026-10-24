package object.agentSkillInstallation

import data.common.hasNoConstraintPermission
import data.common.hasOwnerConstraintPermission

# Typed rules for recipient-owned `agent-skill-installation` records (#3861).
# Agent Services checks them for the real caller on every installation
# operation, with the complete record, and then reads and writes installation
# records with its internal session. The generic Registry API doesn't use them:
# installation records are reachable there only by admins and unconstrained
# generic grants (see `object/record/allow.rego`).
#
# An installation authorizes only its own record: never the original source.
# Source reads are always separate `object/agentSkill/user/read` decisions for
# the real caller, made on install, download and every manifest resolution.
#
# All rules use only literal comparisons and existence checks. Validating an
# installation's deterministic identity (record ID, names and source ID) is
# data validation, not authorisation: Agent Services does it before every write
# and for every record it returns.

default allow = false

allow {
	verifyPermission(input.operationUri, "agentSkillInstallation")
}

operation(operationUri, name) {
	operationUri == concat("/", ["object/agentSkill/install", name])
}

# The installation belongs to the caller: they're both its recipient and its
# owner. Records that also carry a publication marker are never installations.
ownInstallation(ref) {
	record := input.object[ref]
	not record["agent-skill"]
	record["agent-skill-installation"].userId == input.user.id
	record["access-control"].ownerId == input.user.id
}

verifyPermission(operationUri, ref) {
	input.user.id
	operation(operationUri, "read")
	input.object[ref]["agent-skill-installation"]
	not input.object[ref]["agent-skill"]
	hasNoConstraintPermission(operationUri)
}

# Owners read, install (create) and uninstall (delete) their own installations,
# including malformed ones: Agent Services only offers removal for those.
ownerOperation(operationUri) {
	operation(operationUri, "read")
}

ownerOperation(operationUri) {
	operation(operationUri, "create")
}

ownerOperation(operationUri) {
	operation(operationUri, "delete")
}

verifyPermission(operationUri, ref) {
	input.user.id
	ownerOperation(operationUri)
	hasOwnerConstraintPermission(operationUri)
	ownInstallation(ref)
}

# Installations have no mutable fields yet: identity, source and alias change
# only by uninstalling and installing again. Ownership-constrained update is
# therefore never granted.
unconstrainedWrite(operationUri) {
	operation(operationUri, "create")
}

unconstrainedWrite(operationUri) {
	operation(operationUri, "update")
}

unconstrainedWrite(operationUri) {
	operation(operationUri, "delete")
}

verifyPermission(operationUri, ref) {
	input.user.id
	unconstrainedWrite(operationUri)
	input.object[ref]["agent-skill-installation"]
	not input.object[ref]["agent-skill"]
	hasNoConstraintPermission(operationUri)
}

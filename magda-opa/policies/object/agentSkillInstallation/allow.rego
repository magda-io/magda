package object.agentSkillInstallation

import data.common.hasNoConstraintPermission
import data.common.hasOwnerConstraintPermission

# Typed rules for recipient-owned `agent-skill-installation` records (#3861).
# An installation authorizes only its own record: never the original source.
# Source reads are always separate `object/agentSkill/user/read` decisions for
# the real caller, made on install, download and every manifest resolution.

default allow = false

allow {
	verifyPermission(input.operationUri, "agentSkillInstallation")
}

operation(operationUri, name) {
	operationUri == sprintf("object/agentSkill/install/%s", [name])
}

validSkillName(name) {
	regex.match("^[a-z0-9]+(?:-[a-z0-9]+)*$", name)
	count(name) <= 46
	not startswith(name, "system-")
	name != "capture-workflow"
	name != "magda-mgd"
}

sourceParts(sourceSkillId) = [userId, name] {
	matches := regex.find_all_string_submatch_n("^agent-skill-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-([a-z0-9]+(?:-[a-z0-9]+)*)$", sourceSkillId, 1)
	count(matches) == 1
	userId := matches[0][1]
	name := matches[0][2]
}

effectiveName(installation, sourceName) = installation.alias {
	installation.alias
	installation.alias != sourceName
}

effectiveName(installation, sourceName) = sourceName {
	not installation.alias
}

# The complete deterministic identity of a supplied (current or proposed)
# installation: recipient-namespaced ID, recipient ownership, a well-formed
# other-user source and a valid effective name. Records that also carry a
# publication marker are never installations.
validInstallationIdentity(ref) {
	record := input.object[ref]
	not record["agent-skill"]
	installation := record["agent-skill-installation"]
	regex.match("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", installation.userId)
	[sourceUserId, sourceName] := sourceParts(installation.sourceSkillId)
	sourceUserId != installation.userId
	validSkillName(sourceName)
	name := effectiveName(installation, sourceName)
	validSkillName(name)
	record.name == name
	record.id == sprintf("agent-skill-%s-%s", [installation.userId, name])
	record["access-control"].ownerId == installation.userId
}

# Reads use only existence checks and literal comparisons so Registry can
# translate the partial decision into SQL; Agent Services validates the full
# identity of every returned record.
verifyPermission(operationUri, ref) {
	input.user.id
	operation(operationUri, "read")
	input.object[ref]["agent-skill-installation"]
	hasNoConstraintPermission(operationUri)
}

verifyPermission(operationUri, ref) {
	input.user.id
	operation(operationUri, "read")
	hasOwnerConstraintPermission(operationUri)
	input.object[ref]["access-control"].ownerId == input.user.id
	input.object[ref]["agent-skill-installation"].userId == input.user.id
}

# Installing is strictly self-targeted.
verifyPermission(operationUri, ref) {
	input.user.id
	operation(operationUri, "create")
	validInstallationIdentity(ref)
	hasOwnerConstraintPermission(operationUri)
	input.object[ref]["agent-skill-installation"].userId == input.user.id
}

# A recipient can always remove their own installation record, including one
# whose source was deleted or revoked, or whose metadata is malformed, as long
# as it is unambiguously theirs.
verifyPermission(operationUri, ref) {
	input.user.id
	operation(operationUri, "delete")
	hasOwnerConstraintPermission(operationUri)
	record := input.object[ref]
	not record["agent-skill"]
	record["agent-skill-installation"].userId == input.user.id
	record["access-control"].ownerId == input.user.id
	startswith(record.id, sprintf("agent-skill-%s-", [input.user.id]))
}

# Installations have no mutable fields yet: identity, source and alias change
# only by uninstalling and installing again. Ownership-constrained update is
# therefore never granted; unconstrained management keeps a valid identity.
unconstrainedWrite(operationUri) {
	operation(operationUri, "create")
}

unconstrainedWrite(operationUri) {
	operation(operationUri, "update")
}

verifyPermission(operationUri, ref) {
	input.user.id
	unconstrainedWrite(operationUri)
	validInstallationIdentity(ref)
	hasNoConstraintPermission(operationUri)
}

verifyPermission(operationUri, ref) {
	input.user.id
	operation(operationUri, "delete")
	input.object[ref]["agent-skill-installation"]
	not input.object[ref]["agent-skill"]
	hasNoConstraintPermission(operationUri)
}

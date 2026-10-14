package object.agentSkill

import data.common.hasNoConstraintPermission
import data.common.hasOrgUnitConstraintPermission
import data.common.hasOwnerConstraintPermission
import data.common.hasPermissionAllowExemption

default allow = false

allow {
	verifyPermission(input.operationUri, "agentSkill")
}

operationForType(operationUri, publicationType, operation) {
	operationUri == sprintf("object/agentSkill/%s/%s", [publicationType, operation])
}

supportedOperation(operationUri, publicationType) {
	operationForType(operationUri, publicationType, "create")
}

supportedOperation(operationUri, publicationType) {
	operationForType(operationUri, publicationType, "read")
}

supportedOperation(operationUri, publicationType) {
	operationForType(operationUri, publicationType, "update")
}

supportedOperation(operationUri, publicationType) {
	operationForType(operationUri, publicationType, "delete")
}

writeOperation(operationUri, publicationType) {
	operationForType(operationUri, publicationType, "create")
}

writeOperation(operationUri, publicationType) {
	operationForType(operationUri, publicationType, "update")
}

writeOperation(operationUri, publicationType) {
	operationForType(operationUri, publicationType, "delete")
}

# Read rules deliberately use only literal comparisons and existence checks so
# Registry can convert OPA's partial decision into SQL aspect filters. Agent
# Services validates the complete deterministic identity of every returned
# record before exposing it.
recordPublicationType(inputObjectRefName) = "system" {
	skill := input.object[inputObjectRefName]["agent-skill"]
	skill.type == "system"
	not skill.userId
}

recordPublicationType(inputObjectRefName) = "user" {
	skill := input.object[inputObjectRefName]["agent-skill"]
	skill.type == "user"
	skill.userId
}

# Writes use the full deterministic identity. Direct create/update/delete of a
# malformed publication therefore fails closed when the proposed/current record
# is supplied to OPA.
validPublicationIdentity(inputObjectRefName, "system") {
	recordPublicationType(inputObjectRefName) == "system"
	record := input.object[inputObjectRefName]
	skill := record["agent-skill"]
	regex.match("^system-[a-z0-9]+(?:-[a-z0-9]+)*$", skill.name)
	count(skill.name) <= 46
	record.name == skill.name
	record.id == sprintf("agent-skill-%s", [skill.name])
	skill.archiveKey == sprintf("agent-services/skills/system-skills/%s.zip", [record.id])
}

validPublicationIdentity(inputObjectRefName, "user") {
	recordPublicationType(inputObjectRefName) == "user"
	record := input.object[inputObjectRefName]
	skill := record["agent-skill"]
	regex.match("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", skill.userId)
	regex.match("^[a-z0-9]+(?:-[a-z0-9]+)*$", skill.name)
	count(skill.name) <= 46
	not startswith(skill.name, "system-")
	skill.name != "capture-workflow"
	skill.name != "magda-mgd"
	record.name == skill.name
	record.id == sprintf("agent-skill-%s-%s", [skill.userId, skill.name])
	skill.archiveKey == sprintf("agent-services/skills/user-skills/%s/%s.zip", [skill.userId, record.id])
}

# Unconstrained typed reads support system managers and explicit broad grants.
verifyPermission(operationUri, inputObjectRefName) {
	input.user.id
	publicationType := recordPublicationType(inputObjectRefName)
	operationForType(operationUri, publicationType, "read")
	hasNoConstraintPermission(operationUri)
}

unconstrainedWrite(operationUri, "system") {
	writeOperation(operationUri, "system")
}

unconstrainedWrite(operationUri, "user") {
	operationForType(operationUri, "user", "update")
}

unconstrainedWrite(operationUri, "user") {
	operationForType(operationUri, "user", "delete")
}

# Unconstrained system writes are explicit trusted-publisher authority. Broad
# user update/delete grants remain possible, but user creation stays
# self-targeted until a future delegated-provisioning contract is designed.
verifyPermission(operationUri, inputObjectRefName) {
	input.user.id
	publicationType := recordPublicationType(inputObjectRefName)
	unconstrainedWrite(operationUri, publicationType)
	validPublicationIdentity(inputObjectRefName, publicationType)
	hasNoConstraintPermission(operationUri)
}

# Ordinary user creation is strictly self-targeted. userId identifies the
# intended Workspace namespace; it is deliberately not a general read grant.
verifyPermission(operationUri, inputObjectRefName) {
	input.user.id
	validPublicationIdentity(inputObjectRefName, "user")
	operationForType(operationUri, "user", "create")
	hasOwnerConstraintPermission(operationUri)
	input.object[inputObjectRefName]["access-control"].ownerId == input.user.id
	input.object[inputObjectRefName]["agent-skill"].userId == input.user.id
}

verifyPermission(operationUri, inputObjectRefName) {
	input.user.id
	recordPublicationType(inputObjectRefName) == "user"
	operationForType(operationUri, "user", "read")
	hasOwnerConstraintPermission(operationUri)
	input.object[inputObjectRefName]["access-control"].ownerId == input.user.id
}

ownerUserWrite(operationUri) {
	operationForType(operationUri, "user", "update")
}

ownerUserWrite(operationUri) {
	operationForType(operationUri, "user", "delete")
}

verifyPermission(operationUri, inputObjectRefName) {
	input.user.id
	validPublicationIdentity(inputObjectRefName, "user")
	ownerUserWrite(operationUri)
	hasOwnerConstraintPermission(operationUri)
	input.object[inputObjectRefName]["access-control"].ownerId == input.user.id
}

# Skill-specific OrgUnit reads require an actual non-empty matching OrgUnit.
# Do not inherit verifyRecordPermission's missing/empty OrgUnit read fallback.
verifyPermission(operationUri, inputObjectRefName) {
	input.user.id
	publicationType := recordPublicationType(inputObjectRefName)
	operationForType(operationUri, publicationType, "read")
	hasOrgUnitConstraintPermission(operationUri)
	managedOrgUnitId := input.user.managingOrgUnitIds[_]
	managedOrgUnitId != ""
	input.object[inputObjectRefName]["access-control"].orgUnitId == managedOrgUnitId
}

# A pre-authorised grant applies only when the exact assigned permission ID is
# attached to the record. Merely holding the stock constrained permission is
# not enough to expose a private publication.
verifyPermission(operationUri, inputObjectRefName) {
	input.user.id
	publicationType := recordPublicationType(inputObjectRefName)
	operationForType(operationUri, publicationType, "read")
	permission := input.user.permissions[_]
	permission.resourceUri == sprintf("object/agentSkill/%s", [publicationType])
	permission.userOwnershipConstraint == false
	permission.orgUnitOwnershipConstraint == false
	permission.preAuthorisedConstraint == true
	permission.operations[_].uri == operationUri
	permission.id == input.object[inputObjectRefName]["access-control"].preAuthorisedPermissionIds[_]
}

# OrgUnit and pre-authorised stock read permissions are exemption-capable. An
# exempt publication is readable only to a caller holding the matching typed
# read permission with allowExemption=true.
verifyPermission(operationUri, inputObjectRefName) {
	input.user.id
	publicationType := recordPublicationType(inputObjectRefName)
	operationForType(operationUri, publicationType, "read")
	hasPermissionAllowExemption(operationUri)
	input.object[inputObjectRefName]["access-control"].constraintExemption == true
}

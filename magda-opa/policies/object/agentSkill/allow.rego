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

writeAttributionValid(operationUri, publicationType, inputObjectRefName) {
	not operationForType(operationUri, publicationType, "create")
}

writeAttributionValid(operationUri, publicationType, inputObjectRefName) {
	operationForType(operationUri, publicationType, "create")
	input.object[inputObjectRefName]["access-control"].ownerId == input.user.id
	input.object[inputObjectRefName]["agent-skill"].createdBy == input.user.id
	input.object[inputObjectRefName]["agent-skill"].updatedBy == input.user.id
}

# All rules deliberately use only literal comparisons and existence checks, so
# a partial decision can always be translated (e.g. into SQL aspect filters).
# Validating a publication's deterministic identity (record ID, name and
# archive key) is data validation, not authorisation: Agent Services does it
# before every write and for every record it returns. Agent Services is the
# only non-admin writer of Agent Skill records: these typed rules authorise its
# callers, and generic `object/record/*` writes on Agent Skill records are
# limited to admins and unconstrained grants (see `object/record/allow.rego`).
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
	writeAttributionValid(operationUri, publicationType, inputObjectRefName)
	hasNoConstraintPermission(operationUri)
}

# Ordinary user creation is strictly self-targeted. userId identifies the
# intended Workspace namespace; it is deliberately not a general read grant.
verifyPermission(operationUri, inputObjectRefName) {
	input.user.id
	recordPublicationType(inputObjectRefName) == "user"
	operationForType(operationUri, "user", "create")
	writeAttributionValid(operationUri, "user", inputObjectRefName)
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
	recordPublicationType(inputObjectRefName) == "user"
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

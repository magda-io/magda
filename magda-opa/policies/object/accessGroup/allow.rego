package object.accessGroup

import data.common.breakdownOperationUri
import data.common.hasNoConstraintPermission
import data.common.hasOrgUnitConstraintPermission
import data.common.hasOwnerConstraintPermission
import data.common.hasPermissionWithBothOwnerOrgUnitConstraint

default allow = false

# Access groups are authorised with typed `object/accessGroup/*` operations (MAGDA v8):
#
# - `object/accessGroup/create`: create a group with the access group API (`POST /v0/auth/accessGroups`).
#   The decision input is the group to be created, as `input.accessGroup`.
# - `object/accessGroup/read`: read a group record. Group members get this as a pre-authorised
#   permission, listed in the group record's `access-control.preAuthorisedPermissionIds`.
#   Holding any `object/accessGroup/read` permission also shows the access group UI.
# - `object/accessGroup/update`: rename the group or change its description and keywords; add or remove
#   members; list members; add or remove datasets (which also needs `object/record/update` on the dataset).
# - `object/accessGroup/delete`: delete the group.
#
# For read, update and delete the decision input is the group record, as `input.object.accessGroup`
# (or `input.object.record` when `object.record` delegates a registry read to these rules).
#
# Group records are written only by the access group API, with its internal session: their details drive
# role assignment. Generic `object/record/*` grants don't authorise them (see `object/record/allow.rego`).
#
# Read rules use only literal comparisons and existence checks, so a partial decision can be translated
# into SQL aspect filters (e.g. when the registry lists group records).

allow {
	input.operationUri == "object/accessGroup/create"
	verifyCreatePermission
}

allow {
	verifyPermission(input.operationUri, "accessGroup")
}

# --- create

verifyCreatePermission {
	hasNoConstraintPermission("object/accessGroup/create")
}

# With an ownership constraint, the new group must be owned by the user.
verifyCreatePermission {
	hasOwnerConstraintPermission("object/accessGroup/create")
	input.accessGroup.ownerId = input.user.id
}

# With an org unit constraint, the new group must belong to an org unit the user manages.
verifyCreatePermission {
	hasOrgUnitConstraintPermission("object/accessGroup/create")
	input.accessGroup.orgUnitId = input.user.managingOrgUnitIds[_]
}

# With both constraints, both must hold.
verifyCreatePermission {
	hasPermissionWithBothOwnerOrgUnitConstraint("object/accessGroup/create")
	input.accessGroup.ownerId = input.user.id
	input.accessGroup.orgUnitId = input.user.managingOrgUnitIds[_]
}

# --- read, update and delete of an existing group record

recordOperation("object/accessGroup/read")

recordOperation("object/accessGroup/update")

recordOperation("object/accessGroup/delete")

writeOperation("object/accessGroup/update")

writeOperation("object/accessGroup/delete")

# Agent Skill share groups are created and managed by Agent Services, with its internal session.
skillShareGroup(inputObjectRefName) {
	startswith(input.object[inputObjectRefName]["access-group-details"].resourceUri, "object/agentSkill/")
}

# Unconstrained grants (and administrators) cover every group.
verifyPermission(operationUri, inputObjectRefName) {
	recordOperation(operationUri)
	input.object[inputObjectRefName]["access-group-details"]
	hasNoConstraintPermission(operationUri)
}

# Constrained grants read any group they cover, but never write an Agent Skill share group.
constrainedOperationAllowed(operationUri, inputObjectRefName) {
	operationUri == "object/accessGroup/read"
}

constrainedOperationAllowed(operationUri, inputObjectRefName) {
	writeOperation(operationUri)
	not skillShareGroup(inputObjectRefName)
}

verifyPermission(operationUri, inputObjectRefName) {
	constrainedOperationAllowed(operationUri, inputObjectRefName)
	hasOwnerConstraintPermission(operationUri)
	input.object[inputObjectRefName]["access-group-details"]
	input.object[inputObjectRefName]["access-control"].ownerId = input.user.id
}

# Org unit grants need an actual matching org unit. Unlike generic records, a group without an org unit
# isn't readable through an org unit grant.
verifyPermission(operationUri, inputObjectRefName) {
	constrainedOperationAllowed(operationUri, inputObjectRefName)
	hasOrgUnitConstraintPermission(operationUri)
	input.object[inputObjectRefName]["access-group-details"]
	input.user.managingOrgUnitIds[_] = input.object[inputObjectRefName]["access-control"].orgUnitId
}

# A pre-authorised grant covers the groups that list its permission ID.
verifyPermission(operationUri, inputObjectRefName) {
	constrainedOperationAllowed(operationUri, inputObjectRefName)
	input.object[inputObjectRefName]["access-group-details"]

	[resourceType, operationType, resourceUriPrefix] := breakdownOperationUri(operationUri)
	resourceUri := concat("/", [resourceUriPrefix, resourceType])
	input.user.permissions[i].resourceUri = resourceUri
	input.user.permissions[i].userOwnershipConstraint = false
	input.user.permissions[i].orgUnitOwnershipConstraint = false
	input.user.permissions[i].preAuthorisedConstraint = true
	input.user.permissions[i].operations[_].uri = operationUri
	input.user.permissions[i].id = input.object[inputObjectRefName]["access-control"].preAuthorisedPermissionIds[_]
}

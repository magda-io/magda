package common

import rego.v1

import data.common.hasNoConstraintPermission
import data.common.hasOperationType
import data.common.hasOrgUnitConstaintPermission
import data.common.hasOwnerConstraintPermission
import data.common.isEmpty

# if find a permission with no any constraints
verifyRecordPermission(inputOperationUri, _) if {
	hasNoConstraintPermission(inputOperationUri)
}

# if find a permission allow exemption and resource set constraint exemption
verifyRecordPermission(inputOperationUri, inputObjectRefName) if {
	hasPermissionAllowExemption(inputOperationUri)
	input.object[inputObjectRefName]["access-control"].constraintExemption == true
}

# if find a permission with user ownership constraint
verifyRecordPermission(inputOperationUri, inputObjectRefName) if {
	hasOwnerConstraintPermission(inputOperationUri)

	# use inputObjectRefName and avoid hard code context data field name
	# In this way, we can control the reference output in residual rules
	input.object[inputObjectRefName]["access-control"].ownerId == input.user.id
}

# if find a permission with org unit ownership constraint
verifyRecordPermission(inputOperationUri, inputObjectRefName) if {
	hasOrgUnitConstaintPermission(inputOperationUri)

	input.object[inputObjectRefName]["access-control"].orgUnitId in input.user.managingOrgUnitIds
}

# or when a user has org unit ownership constraint permission, he also can access (read permission only) all records with NO org unit assigned
verifyRecordPermission(inputOperationUri, inputObjectRefName) if {
	hasOperationType(inputOperationUri, "read")
	hasOrgUnitConstaintPermission(inputOperationUri)

	# unfortunately, we can't use isEmpty to handle undefined value
	not input.object[inputObjectRefName]["access-control"].orgUnitId
}

verifyRecordPermission(inputOperationUri, inputObjectRefName) if {
	hasOperationType(inputOperationUri, "read")
	hasOrgUnitConstaintPermission(inputOperationUri)
	isEmpty(input.object[inputObjectRefName]["access-control"].orgUnitId)
}

# if find a permission with pre-authorised constraint
verifyRecordPermission(inputOperationUri, inputObjectRefName) if {
	[resourceType, _, resourceUriPrefix] := breakdownOperationUri(inputOperationUri)

	resourceUri := concat("/", [resourceUriPrefix, resourceType])

	some permission in input.user.permissions
	permission.resourceUri == resourceUri

	permission.userOwnershipConstraint == false
	permission.orgUnitOwnershipConstraint == false
	permission.preAuthorisedConstraint == true

	permission.operations[_].uri == inputOperationUri

	permission.id in input.object[inputObjectRefName]["access-control"].preAuthorisedPermissionIds
}

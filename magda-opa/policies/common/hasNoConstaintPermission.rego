package common

import rego.v1

import data.common.breakdownOperationUri

# check if the user has a no constaint permission matches requested operation
hasNoConstraintPermission(inputOperationUri) if {
	[resourceType, _, resourceUriPrefix] := breakdownOperationUri(inputOperationUri)

	resourceUri := concat("/", [resourceUriPrefix, resourceType])

	some permission in input.user.permissions
	permission.resourceUri == resourceUri

	permission.userOwnershipConstraint == false
	permission.orgUnitOwnershipConstraint == false
	permission.preAuthorisedConstraint == false

	permission.operations[_].uri == inputOperationUri
}

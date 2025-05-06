package common

import rego.v1

import data.common.breakdownOperationUri

# check if the user has a permission (with pre-authorised constaint) matches requested operation
# please note: you can't combine the usage of this rule with checking like:
# input.user.permissions[i].id = input.object[xxxx]["access-control"].preAuthorisedPermissionIds[_]
# Why? because `i` is unbound, it will match any user permissions, not have to be the one previous checked by hasPreAuthConstaintPermission
hasPreAuthConstaintPermission(inputOperationUri) if {
	[resourceType, _, resourceUriPrefix] := breakdownOperationUri(inputOperationUri)

	resourceUri := concat("/", [resourceUriPrefix, resourceType])

	some permission in input.user.permissions
	permission.resourceUri == resourceUri

	permission.userOwnershipConstraint == false
	permission.orgUnitOwnershipConstraint == false
	permission.preAuthorisedConstraint == true

	permission.operations[_].uri == inputOperationUri
}

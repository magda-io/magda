package common

import rego.v1

import data.common.breakdownOperationUri

# has permission allow constraint exemption
hasPermissionAllowExemption(inputOperationUri) if {
	[resourceType, _, resourceUriPrefix] := breakdownOperationUri(inputOperationUri)

	resourceUri := concat("/", [resourceUriPrefix, resourceType])

	some permission in input.user.permissions
	permission.resourceUri == resourceUri
	permission.operations[_].uri == inputOperationUri

	permission.allowExemption == true
}

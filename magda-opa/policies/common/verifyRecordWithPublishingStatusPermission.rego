package common

import rego.v1

import data.common.breakdownOperationUri
import data.common.getResourceTypeFromResourceUri
import data.common.isEmpty
import data.common.verifyPublishingStatus
import data.common.verifyRecordPermission

# when resource type contains no wildcard type "*", e.g.  object.dataset.published
# generic record access control rules applies (via verifyRecordPermission)
verifyRecordWithPublishingStatusPermission(inputOperationUri, inputObjectRefName) if {
	[resourceType, _, _] := breakdownOperationUri(inputOperationUri)

	resourceType != "*"

	verifyPublishingStatus(inputObjectRefName, resourceType)

	verifyRecordPermission(inputOperationUri, inputObjectRefName)
}

##### Rules for wildcard resouce type e.g. object.dataset.*
# if find a permission with no any constraints
verifyRecordWithPublishingStatusPermission(inputOperationUri, inputObjectRefName) if {
	[resourceType, operationType, resourceUriPrefix] := breakdownOperationUri(inputOperationUri)

	resourceType == "*"

	some permission in input.user.permissions
	permission.userOwnershipConstraint == false
	permission.orgUnitOwnershipConstraint == false
	permission.preAuthorisedConstraint == false

	permissionResourceType := getResourceTypeFromResourceUri(permission.resourceUri)
	operationUri := concat("/", [resourceUriPrefix, permissionResourceType, operationType])
	resourceUri := concat("/", [resourceUriPrefix, permissionResourceType])

	permission.resourceUri == resourceUri
	permission.operations[_].uri == operationUri

	verifyPublishingStatus(inputObjectRefName, permissionResourceType)
}

# if find a permission allows exemption
verifyRecordWithPublishingStatusPermission(inputOperationUri, inputObjectRefName) if {
	input.object[inputObjectRefName]["access-control"].constraintExemption == true

	[resourceType, operationType, resourceUriPrefix] := breakdownOperationUri(inputOperationUri)

	resourceType == "*"

	some permission in input.user.permissions
	permission.allowExemption == true

	permissionResourceType := getResourceTypeFromResourceUri(permission.resourceUri)
	operationUri := concat("/", [resourceUriPrefix, permissionResourceType, operationType])
	resourceUri := concat("/", [resourceUriPrefix, permissionResourceType])

	permission.resourceUri == resourceUri
	permission.operations[_].uri == operationUri

	verifyPublishingStatus(inputObjectRefName, permissionResourceType)
}

# if find a permission with user ownership constraint
verifyRecordWithPublishingStatusPermission(inputOperationUri, inputObjectRefName) if {
	input.object[inputObjectRefName]["access-control"].ownerId == input.user.id

	[resourceType, operationType, resourceUriPrefix] := breakdownOperationUri(inputOperationUri)

	resourceType == "*"

	some permission in input.user.permissions
	permission.userOwnershipConstraint == true
	permission.orgUnitOwnershipConstraint == false
	permission.preAuthorisedConstraint == false

	permissionResourceType := getResourceTypeFromResourceUri(permission.resourceUri)
	operationUri := concat("/", [resourceUriPrefix, permissionResourceType, operationType])
	resourceUri := concat("/", [resourceUriPrefix, permissionResourceType])

	permission.resourceUri == resourceUri
	permission.operations[_].uri == operationUri

	verifyPublishingStatus(inputObjectRefName, permissionResourceType)
}

# if find a permission with org unit ownership constraint
verifyRecordWithPublishingStatusPermission(inputOperationUri, inputObjectRefName) if {
	input.object[inputObjectRefName]["access-control"].orgUnitId in input.user.managingOrgUnitIds

	[resourceType, operationType, resourceUriPrefix] := breakdownOperationUri(inputOperationUri)

	resourceType == "*"

	some permission in input.user.permissions
	permission.userOwnershipConstraint == false
	permission.orgUnitOwnershipConstraint == true
	permission.preAuthorisedConstraint == false

	permissionResourceType := getResourceTypeFromResourceUri(permission.resourceUri)
	operationUri := concat("/", [resourceUriPrefix, permissionResourceType, operationType])
	resourceUri := concat("/", [resourceUriPrefix, permissionResourceType])

	permission.resourceUri == resourceUri
	permission.operations[_].uri == operationUri

	verifyPublishingStatus(inputObjectRefName, permissionResourceType)
}

# if find a permission with org unit ownership constraint, plus dataset have NOT been assigned org unit
# e.g. anonymous users can access (`read` permission only) all datasets that not belongs to an org unit
verifyRecordWithPublishingStatusPermission(inputOperationUri, inputObjectRefName) if {
	not input.object[inputObjectRefName]["access-control"].orgUnitId

	[resourceType, operationType, resourceUriPrefix] := breakdownOperationUri(inputOperationUri)

	# we only want to allow this special permission grant for "read" operation (issue: #3426)
	operationType == "read"
	resourceType == "*"

	some permission in input.user.permissions
	permission.userOwnershipConstraint == false
	permission.orgUnitOwnershipConstraint == true
	permission.preAuthorisedConstraint == false

	permissionResourceType := getResourceTypeFromResourceUri(permission.resourceUri)
	operationUri := concat("/", [resourceUriPrefix, permissionResourceType, operationType])
	resourceUri := concat("/", [resourceUriPrefix, permissionResourceType])

	permission.resourceUri == resourceUri
	permission.operations[_].uri == operationUri

	verifyPublishingStatus(inputObjectRefName, permissionResourceType)
}

verifyRecordWithPublishingStatusPermission(inputOperationUri, inputObjectRefName) if {
	isEmpty(input.object[inputObjectRefName]["access-control"].orgUnitId)

	[resourceType, operationType, resourceUriPrefix] := breakdownOperationUri(inputOperationUri)

	# we only want to allow this special permission grant for "read" operation (issue: #3426)
	operationType == "read"
	resourceType == "*"

	some permission in input.user.permissions
	permission.userOwnershipConstraint == false
	permission.orgUnitOwnershipConstraint == true
	permission.preAuthorisedConstraint == false

	permissionResourceType := getResourceTypeFromResourceUri(permission.resourceUri)
	operationUri := concat("/", [resourceUriPrefix, permissionResourceType, operationType])
	resourceUri := concat("/", [resourceUriPrefix, permissionResourceType])

	permission.resourceUri == resourceUri
	permission.operations[_].uri == operationUri

	verifyPublishingStatus(inputObjectRefName, permissionResourceType)
}

# if find a permission with pre-authorised constraint
verifyRecordWithPublishingStatusPermission(inputOperationUri, inputObjectRefName) if {
	[resourceType, operationType, resourceUriPrefix] := breakdownOperationUri(inputOperationUri)

	resourceType == "*"

	some permission in input.user.permissions
	permission.userOwnershipConstraint == false
	permission.orgUnitOwnershipConstraint == false
	permission.preAuthorisedConstraint == true

	permissionResourceType := getResourceTypeFromResourceUri(permission.resourceUri)
	operationUri := concat("/", [resourceUriPrefix, permissionResourceType, operationType])
	resourceUri := concat("/", [resourceUriPrefix, permissionResourceType])

	permission.resourceUri == resourceUri
	permission.operations[_].uri == operationUri

	verifyPublishingStatus(inputObjectRefName, permissionResourceType)
	permission.id in input.object[inputObjectRefName]["access-control"].preAuthorisedPermissionIds
}

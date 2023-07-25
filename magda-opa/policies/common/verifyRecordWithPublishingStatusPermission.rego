package common

import data.common.breakdownOperationUri
import data.common.getResourceTypeFromResourceUri
import data.common.verifyPublishingStatus
import data.common.verifyRecordPermission
import data.common.isEmpty

# when resource type contains no wildcard type "*", e.g.  object.dataset.published
# generic record access control rules applies (via verifyRecordPermission)
verifyRecordWithPublishingStatusPermission(inputOperationUri, inputObjectRefName) {
	[resourceType, operationType, resourceUriPrefix] := breakdownOperationUri(inputOperationUri)

	resourceType != "*"

	verifyPublishingStatus(inputObjectRefName, resourceType)

	verifyRecordPermission(inputOperationUri, inputObjectRefName)
}

##### Rules for wildcard resouce type e.g. object.dataset.*
# if find a permission with no any constraints
verifyRecordWithPublishingStatusPermission(inputOperationUri, inputObjectRefName) {
	[resourceType, operationType, resourceUriPrefix] := breakdownOperationUri(inputOperationUri)

	resourceType == "*"

	input.user.permissions[i].userOwnershipConstraint = false
	input.user.permissions[i].orgUnitOwnershipConstraint = false
	input.user.permissions[i].preAuthorisedConstraint = false

	permissionResourceType := getResourceTypeFromResourceUri(input.user.permissions[i].resourceUri)
	operationUri := concat("/", [resourceUriPrefix, permissionResourceType, operationType])
	resourceUri := concat("/", [resourceUriPrefix, permissionResourceType])

	input.user.permissions[i].resourceUri = resourceUri
	input.user.permissions[i].operations[_].uri = operationUri

    verifyPublishingStatus(inputObjectRefName, permissionResourceType)
}

# if find a permission allows exemption
verifyRecordWithPublishingStatusPermission(inputOperationUri, inputObjectRefName) {
	[resourceType, operationType, resourceUriPrefix] := breakdownOperationUri(inputOperationUri)

	resourceType == "*"

	input.user.permissions[i].allowExemption = true

	permissionResourceType := getResourceTypeFromResourceUri(input.user.permissions[i].resourceUri)
	operationUri := concat("/", [resourceUriPrefix, permissionResourceType, operationType])
	resourceUri := concat("/", [resourceUriPrefix, permissionResourceType])

	input.user.permissions[i].resourceUri = resourceUri
	input.user.permissions[i].operations[_].uri = operationUri

    verifyPublishingStatus(inputObjectRefName, permissionResourceType)
	input.object[inputObjectRefName]["access-control"].constraintExemption = true
}

# if find a permission with user ownership constraint
verifyRecordWithPublishingStatusPermission(inputOperationUri, inputObjectRefName) {
	[resourceType, operationType, resourceUriPrefix] := breakdownOperationUri(inputOperationUri)

	resourceType == "*"

	input.user.permissions[i].userOwnershipConstraint = true
	input.user.permissions[i].orgUnitOwnershipConstraint = false
	input.user.permissions[i].preAuthorisedConstraint = false

	permissionResourceType := getResourceTypeFromResourceUri(input.user.permissions[i].resourceUri)
	operationUri := concat("/", [resourceUriPrefix, permissionResourceType, operationType])
	resourceUri := concat("/", [resourceUriPrefix, permissionResourceType])

	input.user.permissions[i].resourceUri = resourceUri
	input.user.permissions[i].operations[_].uri = operationUri

	verifyPublishingStatus(inputObjectRefName, permissionResourceType)
	input.object[inputObjectRefName]["access-control"].ownerId = input.user.id
}

# if find a permission with org unit ownership constraint
verifyRecordWithPublishingStatusPermission(inputOperationUri, inputObjectRefName) {
	[resourceType, operationType, resourceUriPrefix] := breakdownOperationUri(inputOperationUri)

	resourceType == "*"

	input.user.permissions[i].userOwnershipConstraint = false
	input.user.permissions[i].orgUnitOwnershipConstraint = true
	input.user.permissions[i].preAuthorisedConstraint = false

	permissionResourceType := getResourceTypeFromResourceUri(input.user.permissions[i].resourceUri)
	operationUri := concat("/", [resourceUriPrefix, permissionResourceType, operationType])
	resourceUri := concat("/", [resourceUriPrefix, permissionResourceType])

	input.user.permissions[i].resourceUri = resourceUri
	input.user.permissions[i].operations[_].uri = operationUri

	verifyPublishingStatus(inputObjectRefName, permissionResourceType)
	input.user.managingOrgUnitIds[_] = input.object[inputObjectRefName]["access-control"].orgUnitId
}

# if find a permission with org unit ownership constraint, plus dataset have NOT been assigned org unit
# e.g. anonymous users can access (`read` permission only) all datasets that not belongs to an org unit
verifyRecordWithPublishingStatusPermission(inputOperationUri, inputObjectRefName) {
	[resourceType, operationType, resourceUriPrefix] := breakdownOperationUri(inputOperationUri)

	# we only want to allow this special permission grant for "read" operation (issue: #3426)
	operationType == "read"
	resourceType == "*"

	input.user.permissions[i].userOwnershipConstraint = false
	input.user.permissions[i].orgUnitOwnershipConstraint = true
	input.user.permissions[i].preAuthorisedConstraint = false

	permissionResourceType := getResourceTypeFromResourceUri(input.user.permissions[i].resourceUri)
	operationUri := concat("/", [resourceUriPrefix, permissionResourceType, operationType])
	resourceUri := concat("/", [resourceUriPrefix, permissionResourceType])

	input.user.permissions[i].resourceUri = resourceUri
	input.user.permissions[i].operations[_].uri = operationUri

	verifyPublishingStatus(inputObjectRefName, permissionResourceType)

	not input.object[inputObjectRefName]["access-control"].orgUnitId
}

verifyRecordWithPublishingStatusPermission(inputOperationUri, inputObjectRefName) {
	[resourceType, operationType, resourceUriPrefix] := breakdownOperationUri(inputOperationUri)

    # we only want to allow this special permission grant for "read" operation (issue: #3426)
	operationType == "read"
	resourceType == "*"

	input.user.permissions[i].userOwnershipConstraint = false
	input.user.permissions[i].orgUnitOwnershipConstraint = true
	input.user.permissions[i].preAuthorisedConstraint = false

	permissionResourceType := getResourceTypeFromResourceUri(input.user.permissions[i].resourceUri)
	operationUri := concat("/", [resourceUriPrefix, permissionResourceType, operationType])
	resourceUri := concat("/", [resourceUriPrefix, permissionResourceType])

	input.user.permissions[i].resourceUri = resourceUri
	input.user.permissions[i].operations[_].uri = operationUri

	verifyPublishingStatus(inputObjectRefName, permissionResourceType)

	isEmpty(input.object[inputObjectRefName]["access-control"].orgUnitId)
}

# if find a permission with pre-authorised constraint
verifyRecordWithPublishingStatusPermission(inputOperationUri, inputObjectRefName) {
	[resourceType, operationType, resourceUriPrefix] := breakdownOperationUri(inputOperationUri)

	resourceType == "*"

	input.user.permissions[i].userOwnershipConstraint = false
	input.user.permissions[i].orgUnitOwnershipConstraint = false
	input.user.permissions[i].preAuthorisedConstraint = true

	permissionResourceType := getResourceTypeFromResourceUri(input.user.permissions[i].resourceUri)
	operationUri := concat("/", [resourceUriPrefix, permissionResourceType, operationType])
	resourceUri := concat("/", [resourceUriPrefix, permissionResourceType])

	input.user.permissions[i].resourceUri = resourceUri
	input.user.permissions[i].operations[_].uri = operationUri

	verifyPublishingStatus(inputObjectRefName, permissionResourceType)
	input.object[inputObjectRefName]["access-control"].preAuthorisedPermissionIds[_] = input.user.permissions[i].id
}
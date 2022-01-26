package object.dataset

import data.common.breakdownOperationUri
import data.common.getResourceTypeFromResourceUri
import data.common.verifyRecordPermission

default allow = false

allow {
    verifyPermission(input.operationUri, "dataset")
}

# when resource type contains no wildcard type "*", e.g.  object.dataset.published
# generic record access control rules applies (via verifyRecordPermission)
verifyPermission(inputOperationUri, inputObjectRefName) {
    [resourceType, operationType, resourceUriPrefix] := breakdownOperationUri(inputOperationUri)
    
    resourceType != "*"
    
    input.object[inputObjectRefName].publishing.state = resourceType

    verifyRecordPermission(inputOperationUri, inputObjectRefName)
}

##### Rules for wildcard resouce type e.g. object.dataset.*
# if find a permission with no any constraints
verifyPermission(inputOperationUri, inputObjectRefName) {
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

    input.object[inputObjectRefName].publishing.state = permissionResourceType
}

# if find a permission with user ownership constraint
verifyPermission(inputOperationUri, inputObjectRefName) {
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

    input.object[inputObjectRefName].publishing.state = permissionResourceType
    input.object[inputObjectRefName]["access-control"].ownerId = input.user.id
}

# if find a permission with org unit ownership constraint
verifyPermission(inputOperationUri, inputObjectRefName) {
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

    input.object[inputObjectRefName].publishing.state = permissionResourceType
    input.user.managingOrgUnitIds[_] = input.object[inputObjectRefName]["access-control"].orgUnitOwnerId
}

# if find a permission with pre-authorised constraint
verifyPermission(inputOperationUri, inputObjectRefName) {
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

    input.object[inputObjectRefName].publishing.state = permissionResourceType
    input.object[inputObjectRefName]["access-control"].preAuthorisedPermissionIds[_] = input.user.permissions[i].id
}

package common

import data.common.breakdownOperationUri


# if find a permission with no any constraints
verifyRecordPermission(inputOperationUri, inputObjectRefName) {
    [resourceType, operationType, resourceUriPrefix] := breakdownOperationUri(inputOperationUri)

    resourceUri := concat("/", [resourceUriPrefix, resourceType])

    input.user.permissions[i].resourceUri = resourceUri

    input.user.permissions[i].userOwnershipConstraint = false
    input.user.permissions[i].orgUnitOwnershipConstraint = false
    input.user.permissions[i].preAuthorisedConstraint = false

    input.user.permissions[i].operations[_].uri = inputOperationUri
}

# if find a permission with user ownership constraint
verifyRecordPermission(inputOperationUri, inputObjectRefName) {
    [resourceType, operationType, resourceUriPrefix] := breakdownOperationUri(inputOperationUri)

    resourceUri := concat("/", [resourceUriPrefix, resourceType])

    input.user.permissions[i].resourceUri = resourceUri
    
    input.user.permissions[i].userOwnershipConstraint = true
    input.user.permissions[i].orgUnitOwnershipConstraint = false
    input.user.permissions[i].preAuthorisedConstraint = false
    
    input.user.permissions[i].operations[_].uri = inputOperationUri

    # use inputObjectRefName and avoid hard code context data field name
    # In this way, we can control the reference output in residual rules
    input.object[inputObjectRefName]["dataset-access-control"].ownerId = input.user.id
}

# if find a permission with org unit ownership constraint
verifyRecordPermission(inputOperationUri, inputObjectRefName) {
    [resourceType, operationType, resourceUriPrefix] := breakdownOperationUri(inputOperationUri)

    resourceUri := concat("/", [resourceUriPrefix, resourceType])

    input.user.permissions[i].resourceUri = resourceUri
    
    input.user.permissions[i].userOwnershipConstraint = false
    input.user.permissions[i].orgUnitOwnershipConstraint = true
    input.user.permissions[i].preAuthorisedConstraint = false
    
    input.user.permissions[i].operations[_].uri = inputOperationUri

    input.user.managingOrgUnitIds[_] = input.object[inputObjectRefName]["dataset-access-control"].orgUnitOwnerId
}

# if find a permission with pre-authorised constraint
verifyRecordPermission(inputOperationUri, inputObjectRefName) {
    [resourceType, operationType, resourceUriPrefix] := breakdownOperationUri(inputOperationUri)

    resourceUri := concat("/", [resourceUriPrefix, resourceType])

    input.user.permissions[i].resourceUri = resourceUri
    
    input.user.permissions[i].userOwnershipConstraint = false
    input.user.permissions[i].orgUnitOwnershipConstraint = false
    input.user.permissions[i].preAuthorisedConstraint = true
    
    input.user.permissions[i].operations[_].uri = inputOperationUri

    input.object[inputObjectRefName]["dataset-access-control"].preAuthorisedPermissionIds[_] = input.user.permissions[i].id
}

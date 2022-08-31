package common

import data.common.breakdownOperationUri

# check if the user has a ownership constaint permission matches requested operation
hasOwnerConstraintPermission(inputOperationUri) {
    [resourceType, operationType, resourceUriPrefix] := breakdownOperationUri(inputOperationUri)

    resourceUri := concat("/", [resourceUriPrefix, resourceType])

    input.user.permissions[i].resourceUri = resourceUri
    
    input.user.permissions[i].userOwnershipConstraint = true
    input.user.permissions[i].orgUnitOwnershipConstraint = false
    input.user.permissions[i].preAuthorisedConstraint = false
    
    input.user.permissions[i].operations[_].uri = inputOperationUri
}

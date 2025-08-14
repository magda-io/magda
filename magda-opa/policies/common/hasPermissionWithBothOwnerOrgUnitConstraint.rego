package common

import data.common.breakdownOperationUri

# check if the user has a permission matches requested operation with both ownership and orgUnit constraints
hasPermissionWithBothOwnerOrgUnitConstraint(inputOperationUri) {
    [resourceType, operationType, resourceUriPrefix] := breakdownOperationUri(inputOperationUri)

    resourceUri := concat("/", [resourceUriPrefix, resourceType])

    input.user.permissions[i].resourceUri = resourceUri
    
    input.user.permissions[i].userOwnershipConstraint = true
    input.user.permissions[i].orgUnitOwnershipConstraint = true
    input.user.permissions[i].preAuthorisedConstraint = false
    
    input.user.permissions[i].operations[_].uri = inputOperationUri
}

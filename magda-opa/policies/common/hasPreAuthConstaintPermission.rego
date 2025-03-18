package common

import data.common.breakdownOperationUri

# check if the user has a permission (with pre-authorised constaint) matches requested operation
# please note: you can't combine the usage of this rule with checking like:
# input.user.permissions[i].id = input.object[xxxx]["access-control"].preAuthorisedPermissionIds[_]
# Why? because `i` is unbound, it will match any user permissions, not have to be the one previous checked by hasPreAuthConstaintPermission
hasPreAuthConstaintPermission(inputOperationUri) {
    [resourceType, operationType, resourceUriPrefix] := breakdownOperationUri(inputOperationUri)

    resourceUri := concat("/", [resourceUriPrefix, resourceType])

    input.user.permissions[i].resourceUri = resourceUri
    
    input.user.permissions[i].userOwnershipConstraint = false
    input.user.permissions[i].orgUnitOwnershipConstraint = false
    input.user.permissions[i].preAuthorisedConstraint = true
    
    input.user.permissions[i].operations[_].uri = inputOperationUri
}

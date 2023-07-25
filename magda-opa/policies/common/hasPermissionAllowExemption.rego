package common

import data.common.breakdownOperationUri

# has permission allow constraint exemption
hasPermissionAllowExemption(inputOperationUri) {
    [resourceType, operationType, resourceUriPrefix] := breakdownOperationUri(inputOperationUri)

    resourceUri := concat("/", [resourceUriPrefix, resourceType])

    input.user.permissions[i].resourceUri = resourceUri
    input.user.permissions[i].operations[_].uri = inputOperationUri
    
    input.user.permissions[i].allowExemption = true
}

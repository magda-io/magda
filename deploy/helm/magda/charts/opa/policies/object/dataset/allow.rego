package object.dataset

default allow = false

getResourceUriFromOperationUri(operationUri) = resourceUri {
    parts := split(operationUri, "/")
    resourceUri := concat("/", array.slice(parts, 0, count(parts)-1))
}

# if find a permission with no any constraints
allow {
    resourceUri = getResourceUriFromOperationUri(input.operationUri)
    
    input.user.permissions[i].resourceUri = resourceUri

    input.user.permissions[i].userOwnershipConstraint = false
    input.user.permissions[i].orgUnitOwnershipConstraint = false
    input.user.permissions[i].preAuthorisedConstraint = false
    
    input.user.permissions[i].operations[_].uri = input.operationUri
}

# if find a permission with user ownership constraint
allow {
    resourceUri = getResourceUriFromOperationUri(input.operationUri)

    input.user.permissions[i].resourceUri = resourceUri
    
    input.user.permissions[i].userOwnershipConstraint = true
    input.user.permissions[i].orgUnitOwnershipConstraint = false
    input.user.permissions[i].preAuthorisedConstraint = false
    
    input.user.permissions[i].operations[_].uri = input.operationUri

    input.object.dataset.accessControl.ownerId = input.user.id
}

# if find a permission with org unit ownership constraint
allow {
    resourceUri = getResourceUriFromOperationUri(input.operationUri)

    input.user.permissions[i].resourceUri = resourceUri
    
    input.user.permissions[i].userOwnershipConstraint = false
    input.user.permissions[i].orgUnitOwnershipConstraint = true
    input.user.permissions[i].preAuthorisedConstraint = false
    
    input.user.permissions[i].operations[_].uri = input.operationUri

    input.user.managingOrgUnitIds[_] = input.object.dataset.accessControl.orgUnitOwnerId
}

# if find a permission with pre-authorised constraint
allow {
    resourceUri = getResourceUriFromOperationUri(input.operationUri)

    input.user.permissions[i].resourceUri = resourceUri
    
    input.user.permissions[i].userOwnershipConstraint = false
    input.user.permissions[i].orgUnitOwnershipConstraint = false
    input.user.permissions[i].preAuthorisedConstraint = true
    
    input.user.permissions[i].operations[_].uri = input.operationUri

    input.object.dataset.accessControl.preAuthoisedPermissionIds[_] = input.user.permissions[i].id
}
package object.record

import data.object.dataset.verifyPermission as verifyDatasetPermission
import data.common.breakdownOperationUri

default allow = false

allow {
    # dcat-dataset-strings' existence proves it's a dataset record
    [resourceType, operationType, resourceUriPrefix] := breakdownOperationUri(input.operationUri)
    inputOperationUri := concat("/", ["object", "dataset", "*", operationType])
    input.object.record["dcat-dataset-strings"]
    # proxy to dataset related permission decision
    verifyDatasetPermission(inputOperationUri, "record")
}

# if find a permission with no any constraints
allow {
    [resourceType, operationType, resourceUriPrefix] := breakdownOperationUri(input.operationUri)

    resourceUri := concat("/", [resourceUriPrefix, resourceType])

    input.user.permissions[i].resourceUri = resourceUri

    input.user.permissions[i].userOwnershipConstraint = false
    input.user.permissions[i].orgUnitOwnershipConstraint = false
    input.user.permissions[i].preAuthorisedConstraint = false

    input.user.permissions[i].operations[_].uri = input.operationUri
}

# if find a permission with user ownership constraint
allow {
    [resourceType, operationType, resourceUriPrefix] := breakdownOperationUri(input.operationUri)

    resourceUri := concat("/", [resourceUriPrefix, resourceType])

    input.user.permissions[i].resourceUri = resourceUri
    
    input.user.permissions[i].userOwnershipConstraint = true
    input.user.permissions[i].orgUnitOwnershipConstraint = false
    input.user.permissions[i].preAuthorisedConstraint = false
    
    input.user.permissions[i].operations[_].uri = input.operationUri

    input.object.record["dataset-access-control"].ownerId = input.user.id
}

# if find a permission with org unit ownership constraint
allow {
    [resourceType, operationType, resourceUriPrefix] := breakdownOperationUri(input.operationUri)

    resourceUri := concat("/", [resourceUriPrefix, resourceType])

    input.user.permissions[i].resourceUri = resourceUri
    
    input.user.permissions[i].userOwnershipConstraint = false
    input.user.permissions[i].orgUnitOwnershipConstraint = true
    input.user.permissions[i].preAuthorisedConstraint = false
    
    input.user.permissions[i].operations[_].uri = input.operationUri

    input.user.managingOrgUnitIds[_] = input.object.record["dataset-access-control"].orgUnitOwnerId
}

# if find a permission with pre-authorised constraint
allow {
    [resourceType, operationType, resourceUriPrefix] := breakdownOperationUri(input.operationUri)

    resourceUri := concat("/", [resourceUriPrefix, resourceType])

    input.user.permissions[i].resourceUri = resourceUri
    
    input.user.permissions[i].userOwnershipConstraint = false
    input.user.permissions[i].orgUnitOwnershipConstraint = false
    input.user.permissions[i].preAuthorisedConstraint = true
    
    input.user.permissions[i].operations[_].uri = input.operationUri

    input.object.record["dataset-access-control"].preAuthorisedPermissionIds[_] = input.user.permissions[i].id
}

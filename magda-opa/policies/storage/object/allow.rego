package storage.object

import data.common.hasNoConstraintPermission
import data.common.hasOwnerConstraintPermission
import data.common.hasOrgUnitConstaintPermission
import data.common.breakdownOperationUri
import data.common.isEmpty

default allow = false

# Users has a unlimited permission to perform the operation on storage object will be allowed
allow {
    hasNoConstraintPermission(input.operationUri)
}

# Rules for permissions with ownership constraint
# i.e. only owner of the storage object (file) can perform the operation
allow {
    hasOwnerConstraintPermission(input.operationUri)
    # storage object metadata ownerId should match current user's id
    input.storage.object.ownerId = input.user.id
}

# Rules for permissions with org unit constraint
allow {
    hasOrgUnitConstaintPermission(input.operationUri)
    # storage object metadata orgUnitId should match current user's managingOrgUnitIds
    input.user.managingOrgUnitIds[_] = input.storage.object.orgUnitId
}

# or when a user has org unit ownership constraint permission, he also can access (read only) all objects with NO org unit assigned
allow {
    [resourceType, operationType, resourceUriPrefix] := breakdownOperationUri(input.operationUri)
    operationType == "read"
    hasOrgUnitConstaintPermission(input.operationUri)
    not input.storage.object.orgUnitId
}

# or when a user has org unit ownership constraint permission, he also can access (read only) all objects with NO org unit assigned
allow {
    [resourceType, operationType, resourceUriPrefix] := breakdownOperationUri(input.operationUri)
    operationType == "read"
    hasOrgUnitConstaintPermission(input.operationUri)
    isEmpty(input.storage.object.orgUnitId)
}


# If user has access to the record that the file has attach to, he has access to the file (same operation) as well
# This rule deals with `read` operation
# users with either "object/record/read" are allow to access
allow {
    input.storage.object.recordId = input.object.record.id
    [resourceType, operationType, resourceUriPrefix] := breakdownOperationUri(input.operationUri)
    operationType = "read"
    data.object.record.verifyPermission("object/record/read")
}

# If user has access to the record that the file has attach to, he has access to the file (same operation) as well
# This rule deals with `upload` operation
# users with either "object/record/create" or "object/record/update" are allow to access
allow {
    input.storage.object.recordId = input.object.record.id
    [resourceType, operationType, resourceUriPrefix] := breakdownOperationUri(input.operationUri)
    operationType = "upload"
    data.object.record.verifyPermission("object/record/create")
}

allow {
    input.storage.object.recordId = input.object.record.id
    [resourceType, operationType, resourceUriPrefix] := breakdownOperationUri(input.operationUri)
    operationType = "upload"
    data.object.record.verifyPermission("object/record/update")
}

# If user has access to the record that the file has attach to, he has access to the file (same operation) as well
# This rule deals with `delete` operation
# users with either "object/record/create" or "object/record/update" or "object/record/delete" are allow to access
allow {
    input.storage.object.recordId = input.object.record.id
    [resourceType, operationType, resourceUriPrefix] := breakdownOperationUri(input.operationUri)
    operationType = "delete"
    data.object.record.verifyPermission("object/record/create")
}

allow {
    input.storage.object.recordId = input.object.record.id
    [resourceType, operationType, resourceUriPrefix] := breakdownOperationUri(input.operationUri)
    operationType = "delete"
    data.object.record.verifyPermission("object/record/update")
}

allow {
    input.storage.object.recordId = input.object.record.id
    [resourceType, operationType, resourceUriPrefix] := breakdownOperationUri(input.operationUri)
    operationType = "delete"
    data.object.record.verifyPermission("object/record/delete")
}
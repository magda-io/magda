package storage.object

import data.common.breakdownOperationUri
import data.common.hasNoConstraintPermission
import data.common.hasOrgUnitConstraintPermission
import data.common.hasOwnerConstraintPermission
import data.common.isEmpty

default allow = false

linkedRecordBindingValid {
	not input.object.record["agent-skill"]
}

linkedRecordBindingValid {
	input.object.record["agent-skill"]
	input.storage.object.name = input.object.record["agent-skill"].archiveKey
	input.storage.object.ownerId = input.object.record["access-control"].ownerId
}

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
	hasOrgUnitConstraintPermission(input.operationUri)

	# storage object metadata orgUnitId should match current user's managingOrgUnitIds
	input.user.managingOrgUnitIds[_] = input.storage.object.orgUnitId
}

# or when a user has org unit ownership constraint permission, he also can access (read only) all objects with NO org unit assigned
allow {
	[resourceType, operationType, resourceUriPrefix] := breakdownOperationUri(input.operationUri)
	operationType == "read"
	hasOrgUnitConstraintPermission(input.operationUri)
	not input.storage.object.orgUnitId
}

# or when a user has org unit ownership constraint permission, he also can access (read only) all objects with NO org unit assigned
allow {
	[resourceType, operationType, resourceUriPrefix] := breakdownOperationUri(input.operationUri)
	operationType == "read"
	hasOrgUnitConstraintPermission(input.operationUri)
	isEmpty(input.storage.object.orgUnitId)
}

# If user has access to the record that the file has attach to, he has access to the file (same operation) as well
# This rule deals with `read` operation
# users with either "object/record/read" are allow to access
allow {
	input.storage.object.recordId = input.object.record.id
	linkedRecordBindingValid
	[resourceType, operationType, resourceUriPrefix] := breakdownOperationUri(input.operationUri)
	operationType = "read"
	data.object.record.verifyPermission("object/record/read")
}

# A linked upload of a new object follows record create. Replacing an existing
# object follows record update. Storage API supplies this trusted existence bit
# from its pre-upload object-store stat, not from caller metadata.
# Keeping these cases separate prevents create-only grants overwriting archives.
allow {
	input.storage.object.recordId = input.object.record.id
	linkedRecordBindingValid
	[resourceType, operationType, resourceUriPrefix] := breakdownOperationUri(input.operationUri)
	operationType = "upload"
	input.storage.object.exists == false
	data.object.record.verifyPermission("object/record/create")
}

allow {
	input.storage.object.recordId = input.object.record.id
	linkedRecordBindingValid
	[resourceType, operationType, resourceUriPrefix] := breakdownOperationUri(input.operationUri)
	operationType = "upload"
	input.storage.object.exists == true
	data.object.record.verifyPermission("object/record/update")
}

# Deleting an existing linked object requires the corresponding record delete;
# create/update grants cannot be promoted to destructive Storage authority.
allow {
	input.storage.object.recordId = input.object.record.id
	linkedRecordBindingValid
	[resourceType, operationType, resourceUriPrefix] := breakdownOperationUri(input.operationUri)
	operationType = "delete"
	data.object.record.verifyPermission("object/record/delete")
}

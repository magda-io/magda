package storage.bucket

import rego.v1

import data.common.hasNoConstraintPermission
import data.common.hasOperationType
import data.common.hasOrgUnitConstaintPermission
import data.common.hasOwnerConstraintPermission
import data.common.isEmpty

default allow := false

# Only users has a unlimited permission to perform the operation on "storage bucket" will be allowed
allow if {
	hasNoConstraintPermission(input.operationUri)
}

# Rules for permissions with ownership constraint
# i.e. only owner of the storage object (file) can perform the operation
allow if {
	hasOwnerConstraintPermission(input.operationUri)

	# storage bucket tag ownerId should match current user's id
	input.storage.bucket.ownerId == input.user.id
}

# Rules for permissions with org unit constraint
allow if {
	hasOrgUnitConstaintPermission(input.operationUri)

	# storage bucket tag orgUnitId should match current user's managingOrgUnitIds
	input.storage.bucket.orgUnitId in input.user.managingOrgUnitIds
}

# or when a user has org unit ownership constraint permission, he also can access (read only) all buckets with NO org unit assigned
allow if {
	hasOperationType(input.operationUri, "read")
	hasOrgUnitConstaintPermission(input.operationUri)
	not input.storage.bucket.orgUnitId
}

# or when a user has org unit ownership constraint permission, he also can access (read only) all buckets with NO org unit assigned
allow if {
	hasOperationType(input.operationUri, "read")
	hasOrgUnitConstaintPermission(input.operationUri)
	isEmpty(input.storage.bucket.orgUnitId)
}

package authObject.orgUnit

import rego.v1

import data.common.hasNoConstraintPermission
import data.common.hasOrgUnitConstaintPermission

default allow := false

# Users has a unlimited permission to perfom the operation on "org unit" record will be allowed
allow if {
	hasNoConstraintPermission(input.operationUri)
}

# verify the user's permission with Org Unit Constaint
# the user should allow to perform the operation on the user's current org unit and any children
allow if {
	hasOrgUnitConstaintPermission(input.operationUri)
	input.user.orgUnit.id

	# as org units are stored in nested set model
	# children's left is >= than parent's left but <= parent's right
	input.authObject.orgUnit.left >= input.user.orgUnit.left
	input.authObject.orgUnit.right <= input.user.orgUnit.right
}

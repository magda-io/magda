package authObject.user

import rego.v1

import data.common.hasNoConstraintPermission
import data.common.hasOrgUnitConstaintPermission
import data.common.hasOwnerConstraintPermission

default allow := false

# Only users has a unlimited permission to perfom the operation on "user" / "user_role" record will be allowed
allow if {
	hasNoConstraintPermission(input.operationUri)
}

# user should always be able to read his own user record
allow if {
	input.operationUri == "authObject/user/read"
	input.authObject.user.id == input.user.id
}

# user might be able to perform operation on his own record when he has owner constraint permission
allow if {
	hasOwnerConstraintPermission(input.operationUri)
	input.authObject.user.id == input.user.id
}

# user with org unit scope permission can perform operation on user records of all managing org units
allow if {
	hasOrgUnitConstaintPermission(input.operationUri)

	input.authObject.user.orgUnitId in input.user.managingOrgUnitIds
}

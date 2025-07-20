package authObject.credential

import rego.v1

import data.common.hasNoConstraintPermission
import data.common.hasOwnerConstraintPermission

default allow := false

# User has a permission to perfom operation with no constaint
allow if {
	hasNoConstraintPermission(input.operationUri)
}

# User has a permission to perfom operation with owner / user constaint
# i.e. Only can perform operation on user's own credential
allow if {
	hasOwnerConstraintPermission(input.operationUri)
	input.authObject.credential.user_id == input.user.id
}

package object.accessGroup

import rego.v1

import data.common.hasNoConstraintPermission

default allow := false

# `object/accessGroup` resource currently only support two operations: `object/accessGroup/create` & `object/accessGroup/read`
# the creation should done via API `POST /auth/accessGroup`
# we require `no constraint` `object/accessGroup/create` permission to access this API.
# once an access group is created, any other operations requires relevant record level permission to the `access group record` to perform.
# e.g. `object/record/update` or `object/record/delete`
# `object/accessGroup/read` is only created for frontend to determine whether the access group related UI is available to a user.
# The actual read access is secured via resource operation `object/record/read` over access group records
allow if {
	hasNoConstraintPermission(input.operationUri)
}

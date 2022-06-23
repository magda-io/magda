package object.accessGroup

import data.common.hasNoConstraintPermission

default allow = false

# `object/accessGroup` resource currently only support one operation: `object/accessGroup/create`
# the creation should done via API POST /auth/accessGroup
# we require `no constraint` `object/accessGroup/create` permission to access this API.
# once an access group is created, any other operations requires relevant record level permission to the `access group record` to perform.
# e.g. `object/record/update` or `object/record/delete`
allow {
    hasNoConstraintPermission(input.operationUri)
}

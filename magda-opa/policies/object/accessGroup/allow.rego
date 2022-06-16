package object.accessGroup

import data.common.hasNoConstraintPermission

default allow = false

# `object/accessGroup` resource currently only support one operation: `object/accessGroup/create`
# the creation should done via API POST /auth/accessGroup
# once it's created, any other operations will be assessed via access to other resources related to the access group.
# Only users has a unlimited permission to perfom the operation `object/accessGroup/create` will be allowed
allow {
    hasNoConstraintPermission(input.operationUri)
}

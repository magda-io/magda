package authObject.role

import data.common.hasNoConstraintPermission

default allow = false

# Only users has a unlimited permission to perfom the operation on "role" / "role_permissions" record will be allowed
allow {
    hasNoConstraintPermission(input.operationUri)
}

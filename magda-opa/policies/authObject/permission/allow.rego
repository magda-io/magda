package authObject.permission

import data.common.hasNoConstaintPermission

default allow = false

# Only users has a unlimited permission to perfom the operation on "permission" / "permission_operations" record will be allowed
allow {
    hasNoConstaintPermission(input.operationUri)
}
package authObject.role

import data.common.hasNoConstaintPermission

default allow = false

# Only users has a unlimited permission to perfom the operation on "role" / "role_permissions" record will be allowed
allow {
    hasNoConstaintPermission(input.operationUri)
}

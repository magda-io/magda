package authObject.operation

import data.common.hasNoConstraintPermission

default allow = false

# Only users has a unlimited permission to perfom the operation on "operation" record will be allowed
allow {
    hasNoConstraintPermission(input.operationUri)
}

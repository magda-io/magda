package authObject.resource

import data.common.hasNoConstaintPermission

default allow = false

# Only users has a unlimited permission to perfom the operation on "resource" record will be allowed
allow {
    hasNoConstaintPermission(input.operationUri)
}

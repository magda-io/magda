package authObject.orgUnit

import data.common.hasNoConstaintPermission

default allow = false

# Only users has a unlimited permission to perfom the operation on "org unit" record will be allowed
allow {
    hasNoConstaintPermission(input.operationUri)
}

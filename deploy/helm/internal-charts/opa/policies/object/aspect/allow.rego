package object.aspect

import data.common.hasNoConstaintPermission

default allow = false

# Only users has a unlimited permission to perfom the operation on "aspect" will be allowed
# Please note: this policy is for "aspect" not "record's aspect"
allow {
    hasNoConstaintPermission(input.operationUri)
}

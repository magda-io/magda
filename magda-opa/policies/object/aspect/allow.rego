package object.aspect

import data.common.hasNoConstraintPermission

default allow = false

# Only users has a unlimited permission to perfom the operation on "aspect" will be allowed
# Please note: this policy is for "aspect definition" not "record's aspect"
allow {
    hasNoConstraintPermission(input.operationUri)
}

package object.event

import data.common.hasNoConstraintPermission

default allow = false

# Users has a unlimited permission to perfom the operation on "event" will be allowed
allow {
    hasNoConstraintPermission(input.operationUri)
}

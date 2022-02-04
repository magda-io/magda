package object.event

import data.common.hasNoConstaintPermission

default allow = false

# Users has a unlimited permission to perfom the operation on "event" will be allowed
allow {
    hasNoConstaintPermission(input.operationUri)
}

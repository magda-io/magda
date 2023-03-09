package object.faas.function

import data.common.hasNoConstraintPermission

default allow = false

allow {
    hasNoConstraintPermission(input.operationUri)
}

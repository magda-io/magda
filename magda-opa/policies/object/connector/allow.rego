package object.connector

import data.common.hasNoConstraintPermission

default allow = false

allow {
    hasNoConstraintPermission(input.operationUri)
}

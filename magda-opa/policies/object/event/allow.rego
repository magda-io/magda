package object.event

import rego.v1

import data.common.hasNoConstraintPermission

default allow := false

# Users has a unlimited permission to perfom the operation on "event" will be allowed
allow if {
	hasNoConstraintPermission(input.operationUri)
}

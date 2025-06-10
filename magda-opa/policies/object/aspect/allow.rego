package object.aspect

import rego.v1

import data.common.hasNoConstraintPermission

default allow := false

# Only users has a unlimited permission to perfom the operation on "aspect" will be allowed
# Please note: this policy is for "aspect definition" not "record's aspect"
allow if {
	hasNoConstraintPermission(input.operationUri)
}

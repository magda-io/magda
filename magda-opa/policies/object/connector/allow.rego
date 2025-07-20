package object.connector

import rego.v1

import data.common.hasNoConstraintPermission

default allow := false

allow if {
	hasNoConstraintPermission(input.operationUri)
}

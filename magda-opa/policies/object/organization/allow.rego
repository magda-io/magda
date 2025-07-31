package object.organization

import rego.v1

import data.common.verifyRecordPermission

default allow := false

allow if {
	verifyPermission(input.operationUri, "organization")
}

# we don't required any extra access control logic rather than standard verifyRecordPermission
# We still need this policy file in order to allow seperate resource type `object.organization`
# Therefore, we can assign permissions only apply to organization records.
verifyPermission(inputOperationUri, inputObjectRefName) if {
	verifyRecordPermission(inputOperationUri, inputObjectRefName)
}

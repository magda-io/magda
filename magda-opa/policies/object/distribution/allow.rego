package object.distribution

import rego.v1

import data.common.verifyRecordWithPublishingStatusPermission

default allow := false

allow if {
	verifyPermission(input.operationUri, "distribution")
}

# interface for external policy to forward decision request related to "distribution"
verifyPermission(inputOperationUri, inputObjectRefName) if {
	verifyRecordWithPublishingStatusPermission(inputOperationUri, inputObjectRefName)
}

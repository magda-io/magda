package object.distribution

import data.common.verifyRecordWithPublishingStatusPermission

default allow = false

allow {
    verifyPermission(input.operationUri, "distribution")
}

# interface for external policy to forward decision request related to "distribution"
verifyPermission(inputOperationUri, inputObjectRefName) {
	verifyRecordWithPublishingStatusPermission(inputOperationUri, inputObjectRefName)
}

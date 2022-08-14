package object.dataset

import data.common.verifyRecordWithPublishingStatusPermission

default allow = false

allow {
	verifyPermission(input.operationUri, "dataset")
}

# interface for external policy to forward decision request related to "dataset"
verifyPermission(inputOperationUri, inputObjectRefName) {
	verifyRecordWithPublishingStatusPermission(inputOperationUri, inputObjectRefName)
}

package object.distribution

import data.common.verifyRecordPermission

default allow = false

allow {
    verifyPermission(input.operationUri, "distribution")
}

# we don't required any extra access control logic rather than standard verifyRecordPermission
# We still need this policy file in order to allow seperate resource type `object.distribution`
# Therefore, we can assign permissions only apply to distribution records.
verifyPermission(inputOperationUri, inputObjectRefName) {
    verifyRecordPermission(inputOperationUri, inputObjectRefName)
}

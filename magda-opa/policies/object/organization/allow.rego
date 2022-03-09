package object.organization

import data.common.verifyRecordPermission

default allow = false

allow {
    verifyPermission(input.operationUri, "organization")
}

# we don't required any extra access control logic rather than standard verifyRecordPermission
# We still need this policy file in order to allow seperate resource type `object.organization`
# Therefore, we can assign permissions only apply to organization records.
verifyPermission(inputOperationUri, inputObjectRefName) {
    verifyRecordPermission(inputOperationUri, inputObjectRefName)
}

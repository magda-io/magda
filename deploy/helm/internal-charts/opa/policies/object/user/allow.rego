package object.user

default allow = false

allow {
    verifyOperationPermission(input.operationUri)
}

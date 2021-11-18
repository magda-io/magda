package object.permission

default allow = false

allow {
    verifyOperationPermission(input.operationUri)
}

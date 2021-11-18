package object.role

default allow = false

allow {
    verifyOperationPermission(input.operationUri)
}

package authObject.user

import data.common.hasNoConstraintPermission
import data.common.hasOwnerConstraintPermission
import data.common.hasOrgUnitConstaintPermission

default allow = false

# Only users has a unlimited permission to perfom the operation on "user" / "user_role" record will be allowed
allow {
    hasNoConstraintPermission(input.operationUri)
}

# user should always be able to read his own user record
allow {
    input.operationUri == "authObject/user/read"
    input.authObject.user.id = input.user.id
}

# user might be able to perform operation on his own record when he has owner constraint permission
allow {
    hasOwnerConstraintPermission(input.operationUri)
    input.authObject.user.id = input.user.id
}

# user with org unit scope permission can perform operation on user records of all managing org units
allow {
    hasOrgUnitConstaintPermission(input.operationUri)

    input.authObject.user.orgUnitId = input.user.managingOrgUnitIds[_]
}
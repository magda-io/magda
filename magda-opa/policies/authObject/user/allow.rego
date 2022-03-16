package authObject.user

import data.common.hasNoConstraintPermission
import data.common.hasOwnerConstraintPermission
import data.common.hasOrgUnitConstaintPermission

default allow = false

# Only users has a unlimited permission to perfom the operation on "user" / "user_role" record will be allowed
allow {
    hasNoConstraintPermission(input.operationUri)
}

# user might be able to perform operation on his own record
allow {
    hasOwnerConstraintPermission(input.operationUri)

    input.object.user.id = input.user.id
}

# user with org unit scope permission can perform operation on user records of all managing org units
allow {
    hasOrgUnitConstaintPermission(input.operationUri)

    input.object.user.orgUnitOwnerId = input.user.managingOrgUnitIds[_]
}
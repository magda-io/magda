package object.accessGroup

import data.common.hasNoConstraintPermission
import data.common.hasOwnerConstraintPermission
import data.common.hasOrgUnitConstraintPermission
import data.common.hasPermissionWithBothOwnerOrgUnitConstraint

default allow = false

# `object/accessGroup` resource currently only support two operations: `object/accessGroup/create` & `object/accessGroup/read`
# the creation should done via API `POST /auth/accessGroup`
# we require `object/accessGroup/create` permission to access this API.
# once an access group is created, any other operations requires relevant record level permission to the `access group record` to perform.
# e.g. `object/record/update` or `object/record/delete`
# `object/accessGroup/read` is only created for frontend to determine whether the access group related UI is available to a user.
# The actual read access is secured via resource operation `object/record/read` over access group records
allow {
    hasNoConstraintPermission(input.operationUri)
}

# When user has the `object/accessGroup/create` permission with owner constraint, they can only create access groups with ownerId set to their own user id.
allow {
    hasOwnerConstraintPermission(input.operationUri)
    input.accessGroup.ownerId = input.user.id
}

# When user has the `object/accessGroup/create` permission with orgUnit constraint, they can only create access groups with ownerId set to their own user id.
allow {
    hasOwnerConstraintPermission(input.operationUri)
    input.accessGroup.orgUnitId = input.user.managingOrgUnitIds[_]
}

# When user has the `object/accessGroup/create` permission with both ownership and orgUnit constraint, they can only create access groups with both ownerId & orgUnit set to their own user id.
allow {
    hasPermissionWithBothOwnerOrgUnitConstraint(input.operationUri)
    input.accessGroup.ownerId = input.user.id
    input.accessGroup.orgUnitId = input.user.managingOrgUnitIds[_]
}
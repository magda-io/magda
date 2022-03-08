package authObject.credential

import data.common.hasNoConstaintPermission
import data.common.hasOwnerConstaintPermission
import data.common.hasOrgUnitConstaintPermission

default allow = false

# User has a permission to perfom operation with no constaint 
allow {
    hasNoConstaintPermission(input.operationUri)
}

# User has a permission to perfom operation with owner / user constaint
# i.e. Only can perform operation on user's own credential
allow {
    hasOwnerConstaintPermission(input.operationUri)

    input.object.user.id = input.user.id
}

# User has a permission to perfom operation with org unit constaint
# i.e. Only can perform operation on credential belongs to org units that are managed by the user
allow {
    hasOrgUnitConstaintPermission(input.operationUri)

    input.object.user.orgUnitOwnerId = input.user.managingOrgUnitIds[_]
}
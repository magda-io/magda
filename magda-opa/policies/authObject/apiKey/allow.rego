package authObject.apiKey

import data.common.hasNoConstraintPermission
import data.common.hasOwnerConstraintPermission
import data.common.hasOrgUnitConstaintPermission

default allow = false

# User has a permission to perfom operation with no constaint 
allow {
    hasNoConstraintPermission(input.operationUri)
}

# User has a permission to perfom operation with owner / user constaint
# i.e. Only can perform operation on user's own api key
allow {
    hasOwnerConstraintPermission(input.operationUri)

    input.object.user.id = input.user.id
}

# User has a permission to perfom operation with org unit constaint
# i.e. Only can perform operation on api keys belongs to org units that are managed by the user
allow {
    hasOrgUnitConstaintPermission(input.operationUri)

    input.object.user.orgUnitOwnerId = input.user.managingOrgUnitIds[_]
}
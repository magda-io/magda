package authObject.credential

import data.common.hasNoConstraintPermission
import data.common.hasOwnerConstraintPermission

default allow = false

# User has a permission to perfom operation with no constaint 
allow {
    hasNoConstraintPermission(input.operationUri)
}

# User has a permission to perfom operation with owner / user constaint
# i.e. Only can perform operation on user's own credential
allow {
    hasOwnerConstraintPermission(input.operationUri)
    input.authObject.credential.user_id = input.user.id
}

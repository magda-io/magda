package authObject.apiKey

import data.common.hasNoConstraintPermission
import data.common.hasOwnerConstraintPermission

default allow = false

# User has a permission to perfom operation with no constaint 
allow {
    hasNoConstraintPermission(input.operationUri)
}

# User has a permission to perform operation with owner / user constraint
# i.e. Only can perform operation on user's own api key
allow {
    hasOwnerConstraintPermission(input.operationUri)
    input.authObject.apiKey.user_id = input.user.id
}

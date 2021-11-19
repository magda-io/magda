package common

import data.common.breakdownOperationUri
import data.common.hasNoConstaintPermission
import data.common.hasOwnerConstaintPermission
import data.common.hasOrgUnitConstaintPermission
import data.common.hasPreAuthConstaintPermission


# if find a permission with no any constraints
verifyRecordPermission(inputOperationUri, inputObjectRefName) {
    hasNoConstaintPermission(inputOperationUri)
}

# if find a permission with user ownership constraint
verifyRecordPermission(inputOperationUri, inputObjectRefName) {
    hasOwnerConstaintPermission(inputOperationUri)

    # use inputObjectRefName and avoid hard code context data field name
    # In this way, we can control the reference output in residual rules
    input.object[inputObjectRefName]["dataset-access-control"].ownerId = input.user.id
}

# if find a permission with org unit ownership constraint
verifyRecordPermission(inputOperationUri, inputObjectRefName) {
    hasOrgUnitConstaintPermission(inputOperationUri)

    input.user.managingOrgUnitIds[_] = input.object[inputObjectRefName]["dataset-access-control"].orgUnitOwnerId
}

# if find a permission with pre-authorised constraint
verifyRecordPermission(inputOperationUri, inputObjectRefName) {
    hasPreAuthConstaintPermission(inputOperationUri)

    input.object[inputObjectRefName]["dataset-access-control"].preAuthorisedPermissionIds[_] = input.user.permissions[i].id
}

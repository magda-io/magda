package common

import data.common.breakdownOperationUri
import data.common.hasNoConstraintPermission
import data.common.hasOwnerConstraintPermission
import data.common.hasOrgUnitConstaintPermission
import data.common.hasPreAuthConstaintPermission


# if find a permission with no any constraints
verifyRecordPermission(inputOperationUri, inputObjectRefName) {
    hasNoConstraintPermission(inputOperationUri)
}

# if find a permission with user ownership constraint
verifyRecordPermission(inputOperationUri, inputObjectRefName) {
    hasOwnerConstraintPermission(inputOperationUri)

    # use inputObjectRefName and avoid hard code context data field name
    # In this way, we can control the reference output in residual rules
    input.object[inputObjectRefName]["access-control"].ownerId = input.user.id
}

# if find a permission with org unit ownership constraint
verifyRecordPermission(inputOperationUri, inputObjectRefName) {
    hasOrgUnitConstaintPermission(inputOperationUri)

    input.user.managingOrgUnitIds[_] = input.object[inputObjectRefName]["access-control"].orgUnitId
}

# or when a user has org unit ownership constraint permission, he also can access all records with NO org unit assigned
verifyRecordPermission(inputOperationUri, inputObjectRefName) {
    hasOrgUnitConstaintPermission(inputOperationUri)

    not input.object[inputObjectRefName]["access-control"].orgUnitId
}

# if find a permission with pre-authorised constraint
verifyRecordPermission(inputOperationUri, inputObjectRefName) {
    hasPreAuthConstaintPermission(inputOperationUri)

    input.object[inputObjectRefName]["access-control"].preAuthorisedPermissionIds[_] = input.user.permissions[i].id
}

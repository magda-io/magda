package au.csiro.data61.magda.currentUser

import data.au.csiro.data61.magda.permissions
import data.au.csiro.data61.magda.roles
import data.au.csiro.data61.magda.users
import data.au.csiro.data61.magda.orgUnits
import data.au.csiro.data61.magda.resources
import data.input

userInfos = [x | users[i].id = input.user_id; users[i] = x ]

userInfo = userInfos[0]

userDirectOrgUnits[x] { 
    users[i].id = input.user_id
    users[i].org_unit=x
}

userLv1OrgUnits[x]{
    userDirectOrgUnits[_] = orgUnits[i].id
    orgUnits[i].managing_org_units[_] = x
}

userLv2OrgUnits[x]{
    userLv1OrgUnits[_] = orgUnits[i].id
    orgUnits[i].managing_org_units[_] = x
}

userLv3OrgUnits[x]{
    userLv2OrgUnits[_] = orgUnits[i].id
    orgUnits[i].managing_org_units[_] = x
}

userLv4OrgUnits[x]{
    userLv3OrgUnits[_] = orgUnits[i].id
    orgUnits[i].managing_org_units[_] = x
}

userManagingOrgUnits = userDirectOrgUnits | userLv1OrgUnits | userLv2OrgUnits | userLv3OrgUnits | userLv4OrgUnits

default isDatasetOwner = false
isDatasetOwner {
    input.dataset.owner_id = userInfo.id
}

default isDatasetOrgUnitOwner = false
isDatasetOrgUnitOwner {
    userManagingOrgUnits[_] = input.dataset.org_unit_id
}

managingOrgUints[org_unit_id] {
    orgUnits[org_unit_id]
}

permissionsWithOperation[[pid, opId]] {
    permissions[i].operations[_] = opId
    permissions[i].id = pid
    #input.user.roles[_].permissions[_]
}

# all permissionId has OP008
# [pid | data.au.csiro.data61.magda.whoHasAccess.permissionsWithOperation[_]=[pid,"OP008"]]
#userPermissions[id] {
#    users.
#}

#publishers {
#    input.dataset.
#    users[i].permissions[_]=
#}
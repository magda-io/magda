package au.csiro.data61.magda.currentUser

import data.au.csiro.data61.magda
import data.au.csiro.data61.magda.roles
import data.au.csiro.data61.magda.users
import data.au.csiro.data61.magda.orgUnits
import data.au.csiro.data61.magda.resources
import data.input

infos = [x | users[i].id = input.user_id; users[i] = x ]

info = infos[0]

directOrgUnits[x] { 
    users[i].id = input.user_id
    users[i].org_unit=x
}

lv1OrgUnits[x]{
    directOrgUnits[_] = orgUnits[i].id
    orgUnits[i].managing_org_units[_] = x
}

lv2OrgUnits[x]{
    lv1OrgUnits[_] = orgUnits[i].id
    orgUnits[i].managing_org_units[_] = x
}

lv3OrgUnits[x]{
    lv2OrgUnits[_] = orgUnits[i].id
    orgUnits[i].managing_org_units[_] = x
}

lv4OrgUnits[x]{
    lv3OrgUnits[_] = orgUnits[i].id
    orgUnits[i].managing_org_units[_] = x
}

managingOrgUnits = directOrgUnits | lv1OrgUnits | lv2OrgUnits | lv3OrgUnits | lv4OrgUnits

default isDatasetOwner = false
isDatasetOwner {
    input.dataset.owner_id = info.id
}

default isDatasetOrgUnitOwner = false
isDatasetOrgUnitOwner {
    managingOrgUnits[_] = input.dataset.org_unit_id
}

permissionIds[x] {
    info.roles[_] = roles[i].id
    roles[i].permissions[_] = x 
}

permissions[x] {
    permissionIds[_] = magda.permissions[i].id 
    magda.permissions[i] = x 
}

permissionIdsWithOperation[[permissionId, op, ownerConstraint, orgOwnerConstraint, preAuthorisedConstrains]] {
    permissions[i].operations[j] = op
    permissions[i].id = permissionId
    permissions[i].user_ownership_constraint = ownerConstraint
    permissions[i].pre_authorised_constraint = preAuthorisedConstrains
    permissions[i].org_unit_ownership_constraint = orgOwnerConstraint
}

#t1 = {x|permissionIdsWithOperation[[_,input.operation,_,_,_]][0]=x}
#t2 = {x|permissionIdsWithOperation[[_,"OP003",_,_,_]][0]=x}

default canAccessDataset = false

allowAccessCurrentDataset1 {
    input.path = "/resources/dataset"
    # if any no constraints permissions
    permissionIdsWithOperation[[_,input.operation,false,false,false]]
}

allowAccessCurrentDataset2 {
    input.path = "/resources/dataset"
    # if any user ownership constraints
    permissionIdsWithOperation[[_,input.operation,true,_,_]]
    # if yes, then owner_id should match
    input.dataset.owner_id = info.id
}

allowAccessCurrentDataset3 {
    input.path = "/resources/dataset"
    # if any org ownership constraints
    permissionIdsWithOperation[[_,input.operation,_,true,_]]
    # if yes, one of user managingOrgUnits should match
    managingOrgUnits[_] = input.dataset.org_unit_id
}

allowAccessCurrentDataset4 {
    input.path = "/resources/dataset"
    # if any pre-authoised constraints # if yes, it must listed on dataset's pre-authoised list
    input.dataset.pre_authoised_permissions[_] = permissionIdsWithOperation[[_,input.operation,_,_,false]][0]
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
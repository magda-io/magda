package au.csiro.data61.magda.listUsers

import data.au.csiro.data61.magda
import data.au.csiro.data61.magda.orgUnits
import data.au.csiro.data61.magda.resources
import data.input


usersById[[user, id]] {
    magda.users[i].id = id
    magda.users[i] = user
}

directOrgUnits[[orgUnitId, id]] {
    usersById[[user, id]][0].org_unit = orgUnitId
    user.id = id
}

lv1OrgUnits[[orgUnitId, id]]{
    directOrgUnits[[_,id]][0] = orgUnits[i].id
    orgUnits[i].managing_org_units[_] = orgUnitId
}

lv2OrgUnits[[orgUnitId, id]]{
    lv1OrgUnits[[_,id]][0] = orgUnits[i].id
    orgUnits[i].managing_org_units[_] = orgUnitId
}

lv3OrgUnits[[orgUnitId, id]]{
    lv2OrgUnits[[_,id]][0] = orgUnits[i].id
    orgUnits[i].managing_org_units[_] = orgUnitId
}

lv4OrgUnits[[orgUnitId, id]]{
    lv3OrgUnits[[_,id]][0] = orgUnits[i].id
    orgUnits[i].managing_org_units[_] = orgUnitId
}

managingOrgUnits = directOrgUnits | lv1OrgUnits | lv2OrgUnits | lv3OrgUnits | lv4OrgUnits

permissionIds[[permissionId, id]] {
    usersById[[user, id]][0].roles[_] = magda.roles[i].id
    user.id = id
    magda.roles[i].permissions[_] = permissionId
}

permissions[[permission, id]] {
    permissionIds[[_,id]][0] = magda.permissions[i].id 
    magda.permissions[i] = permission
}

roles[[role, id]] {
    usersById[[user, id]][0].roles[_] = magda.roles[i].id
    user.id = id
    magda.roles[i] = role
}

permissionIdsWithOperation[[permissionId, op, ownerConstraint, orgOwnerConstraint, preAuthorisedConstrains, id]] {
    permissions[[p, id]][0].operations[_] = op
    p.id = permissionId
    p.user_ownership_constraint = ownerConstraint
    p.pre_authorised_constraint = preAuthorisedConstrains
    p.org_unit_ownership_constraint = orgOwnerConstraint
}

allowedUsers[[user]] {
    input.path = "/resources/dataset"
    magda.users[i] = user
    # if any no constraints permissions
    permissionIdsWithOperation[[_,input.operation,false,false,false, user.id]]
}

allowedUsers[[user]] {
    input.path = "/resources/dataset"
    magda.users[i] = user
    # if any user ownership constraints
    permissionIdsWithOperation[[_,input.operation,true,_,_,user.id]]
    # if yes, then owner_id should match
    input.dataset.owner_id = user.id
}

allowedUsers[[user]] {
    input.path = "/resources/dataset"
    magda.users[i] = user
    # if any org ownership constraints
    permissionIdsWithOperation[[_,input.operation,_,true,_,user.id]]
    # if yes, one of user managingOrgUnits should match
    managingOrgUnits[[orgUnitId, user.id]][0] = input.dataset.org_unit_id
}

allowedUsers[[user]] {
    input.path = "/resources/dataset"
    magda.users[i] = user
    # if any pre-authoised constraints # if yes, it must listed on dataset's pre-authoised list
    input.dataset.pre_authoised_permissions[_] = permissionIdsWithOperation[[_,input.operation,_,_,true,user.id]][0]
}

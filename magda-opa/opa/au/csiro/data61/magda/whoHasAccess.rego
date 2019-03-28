package au.csiro.data61.magda.whoHasAccess

import data.au.csiro.data61.magda.permissions
import data.au.csiro.data61.magda.roles
import data.au.csiro.data61.magda.users
import data.au.csiro.data61.magda.orgUnits
import data.au.csiro.data61.magda.resources
import data.input

permissionsWithOperation[[pid,opId]] {
    permissions[i].operations[_] = opId
    permissions[i].id = pid
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
package object.registry.aspect.orgunit

import data.object.registry.aspect.owner

# An aspect that is closed by default except to its owning org unit and users/org units with specific permission to access it.

default view = false

# object.registry.aspect.owner PLUS
view {
    owner.view
}

# Viewable by viewers under the owning org unit
view {
    input.user.permissions[_].operations[_].uri == "object/aspect/view"
    input.user.managingOrgUnitIds[_] == input.object.aspects["dataset-access-control"].orgUnitOwnerId
}


default edit = false

# inherits object.registry.aspect.owner
edit {
    owner.edit
}

# Editable by editors under the same org unit 
edit {
    input.user.permissions[_].operations[_].uri == "object/aspect/edit"
    input.object.aspects["dataset-access-control"].orgUnitOwnerId == input.user.managingOrgUnitIds[_]
}

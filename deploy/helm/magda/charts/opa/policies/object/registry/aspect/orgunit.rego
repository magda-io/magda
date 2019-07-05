package object.registry.aspect.orgunit

import data.object.registry.aspect.owner

# An aspect that is closed by default except to its owning org unit and users/org units with specific permission to access it.

default allow = false

# object.registry.aspect.owner PLUS
allow {
    owner.allow
}

# Viewable by viewers under the owning org unit
allow {
    input.user.permissions[_].operations[_].uri == "object/aspect/view"
    input.object.aspects["dataset-access-control"].orgUnitOwnerId == input.user.managingOrgUnitIds[_]
}

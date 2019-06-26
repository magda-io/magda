package object.registry.aspect.owner

default view = false

# Can be viewed by the owner
view {
    input.user.permissions[_].operations[_].uri = "object/aspect/view"
    input.object.aspects["dataset-access-control"].ownerId = input.user.id
}

# Viewable by viewers granted ad-hoc permission
view {
    input.user.permissions[_].operations[_].uri = "object/aspect/view"
    input.object.aspects["dataset-access-control"].adhocViewerUserIds[_] = input.user.id
}

# Viewable by viewers under org units granted ad-hoc permission
view {
    input.user.permissions[_].operations[_].uri = "object/aspect/view"
    input.object.aspects["dataset-access-control"].adhocViewerOrgUnitIds[_] = input.user.managingOrgUnitIds[_]
}

default edit = false

# Can be edited by the owner
edit {
    input.user.permissions[_].operations[_].uri = "object/aspect/edit"
    input.object.aspects["dataset-access-control"].ownerId = input.user.id
}

# Editable by editors granted ad-hoc permission
edit {
    input.user.permissions[_].operations[_].uri = "object/aspect/edit"
    input.object.aspects["dataset-access-control"].adhocViewerUserIds[_] = input.user.id
}

# Editable by editors under org units granted ad-hoc permission
edit {
    input.user.permissions[_].operations[_].uri = "object/aspect/edit"
    input.object.aspects["dataset-access-control"].adhocViewerOrgUnitIds[_] = input.user.managingOrgUnitIds[_]
}
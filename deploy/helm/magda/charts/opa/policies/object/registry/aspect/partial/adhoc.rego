package object.registry.aspect.partial.editadhoc

default view = false

# Accessible by users granted ad-hoc permission
view {
    input.user.permissions[_].operations[_].uri = "object/aspect/view"
    input.object.aspects["access-control"].adhocViewUserIds[_] = input.user.id
}

# Accessible by allowers under org units granted ad-hoc permission
view {
    input.user.permissions[_].operations[_].uri = "object/aspect/view"
    input.object.aspects["access-control"].adhocViewerOrgUnitIds[_] = input.user.managingOrgUnitIds[_]
}

default edit = false

# Accessible by users granted ad-hoc permission
edit {
    input.user.permissions[_].operations[_].uri = "object/aspect/view"
    input.object.aspects["access-control"].adhocEditUserIds[_] = input.user.id
}

# Accessible by allowers under org units granted ad-hoc permission
edit {
    input.user.permissions[_].operations[_].uri = "object/aspect/view"
    input.object.aspects["access-control"].adhocEditerOrgUnitIds[_] = input.user.managingOrgUnitIds[_]
}
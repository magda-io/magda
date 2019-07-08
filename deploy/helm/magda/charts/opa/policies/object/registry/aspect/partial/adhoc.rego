package object.registry.aspect.partial.adhoc

default read = false

# Accessible by users granted ad-hoc permission
read {
    input.object.aspects["access-control"].adhocViewUserIds[_] = input.user.id
}

# Accessible by allowers under org units granted ad-hoc permission
read {
    input.object.aspects["access-control"].adhocViewerOrgUnitIds[_] = input.user.managingOrgUnitIds[_]
}

default update = false

# Accessible by users granted ad-hoc permission
update {
    input.object.aspects["access-control"].adhocEditUserIds[_] = input.user.id
}

# Accessible by allowers under org units granted ad-hoc permission
update {
    input.object.aspects["access-control"].adhocEditerOrgUnitIds[_] = input.user.managingOrgUnitIds[_]
}
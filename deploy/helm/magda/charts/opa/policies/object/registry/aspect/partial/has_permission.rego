package object.registry.aspect.partial.has_permission

has_permission(permission) {
    input.user.permissions[_].operations[_].uri == permission
}

create {
    has_permission("object/registry/record/create")
}

read {
    has_permission("object/registry/record/read")
}

update {
    has_permission("object/registry/record/update")
}

delete {
    has_permission("object/registry/record/delete")
}
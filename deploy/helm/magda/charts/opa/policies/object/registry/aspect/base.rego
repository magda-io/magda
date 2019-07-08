package object.registry.aspect.base

import data.object.registry.aspect.partial.has_permission

create {
    has_permission.create
}

read {
    has_permission.read
}

update {
    has_permission.update
}

delete {
    has_permission.delete
}
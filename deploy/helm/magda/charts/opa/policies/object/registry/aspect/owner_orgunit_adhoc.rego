package object.registry.aspect.owner_orgunit_adhoc

import data.object.registry.aspect.partial.adhoc
import data.object.registry.aspect.partial.has_permission
import data.object.registry.aspect.partial.owner
import data.object.registry.aspect.partial.orgunit
import data.object.registry.aspect.base

create {
    base.create
}

default read = false

read {
    has_permission.read
    owner
}

read {
    has_permission.read
    adhoc.read
}

read {
    has_permission.read
    orgunit
}

default update = false

update {
    has_permission.update
    owner
}

update {
    has_permission.update
    adhoc.update
}

update {
    has_permission.update
    orgunit
}

delete {
    base.delete
}
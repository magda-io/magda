package object.registry.record.owner_orgunit

import data.object.registry.record.partial.has_permission
import data.object.registry.record.partial.owner
import data.object.registry.record.partial.orgunit
import data.object.registry.record.base


default read = false

read {
    has_permission.read
    owner
}

read {
    has_permission.read
    orgunit
}

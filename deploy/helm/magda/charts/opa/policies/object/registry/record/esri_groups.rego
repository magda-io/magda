package object.registry.record.owner_orgunit

import data.object.registry.record.has_permission
import data.object.registry.record.groups
import data.object.registry.record.base

read {
    has_permission.read
    groups
}


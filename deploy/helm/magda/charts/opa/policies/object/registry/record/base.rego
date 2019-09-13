package object.registry.record.base

import data.object.registry.record.has_permission

default read = false

read {
    has_permission.read
}


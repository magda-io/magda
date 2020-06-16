package object.registry.record.owner_only

import data.object.registry.record.owner
import data.object.registry.record.admin_role
import data.object.registry.record.has_permission

read {
    has_permission.read
    owner
}
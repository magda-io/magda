package object.registry.record.esri_owner_groups

import data.object.registry.record.has_permission
import data.object.registry.record.esri_groups
import data.object.registry.record.esri_owner
import data.object.registry.record.esri_public
import data.object.registry.record.esri_expiration
import data.object.registry.record.admin_role

read {
    admin_role
}

read {
    has_permission.read
    esri_groups
    esri_expiration
}

read {
    has_permission.read
    esri_owner
    esri_expiration
}

read {
    esri_public
    esri_expiration
}

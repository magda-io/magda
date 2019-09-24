package object.registry.record.esri_groups

import data.object.registry.record.has_permission
import data.object.registry.record.esri_access_control
import data.object.registry.record.base

read {
    has_permission.read
    esri_access_control
}


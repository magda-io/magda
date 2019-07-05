package object.registry.aspect.owner

default allow = false

import data.object.registry.aspect.partial.viewadhoc

# Can be accessed by the owner
allow {
    input.user.permissions[_].operations[_].uri = "object/aspect/allow"
    input.object.aspects["dataset-access-control"].ownerId = input.user.id
}

allow {
    viewadhoc.allow
}
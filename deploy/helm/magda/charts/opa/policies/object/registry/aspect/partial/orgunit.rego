package object.registry.aspect.partial

orgunit {
    input.object.aspects["access-control"].orgUnitOwnerId == input.user.managingOrgUnitIds[_]
}

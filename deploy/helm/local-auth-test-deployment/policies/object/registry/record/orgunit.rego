package object.registry.record

# "access-control" is the aspect id defined in the registry database.
orgunit {
    input.object.registry.record["access-control"].orgUnitId == input.user.managingOrgUnitIds[_]
}

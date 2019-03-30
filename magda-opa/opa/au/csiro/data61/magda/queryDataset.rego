package au.csiro.data61.magda.queryDataset

default allowAccessEsDataset = false

allowAccessEsDataset {
    input.path = "/resources/dataset"
    # if any no constraints permissions
    permission := input.user.permissions[_]
    operation := permission.operations[_]
    operation = input.operation
    permission.user_ownership_constraint = false
    permission.pre_authorised_constraint = false
    permission.org_unit_ownership_constraint = false
}

allowAccessEsDataset {
    input.path = "/resources/dataset"
    # if any user ownership constraints
    permission := input.user.permissions[_]
    operation := permission.operations[_]
    operation = input.operation
    permission.user_ownership_constraint = true
    # if yes, then owner_id should match
    data.elasticsearch.dataset.accessControlMetadata.owner_id = input.user.id
}

allowAccessEsDataset {
    input.path = "/resources/dataset"
    # if any org ownership constraints
    permission := input.user.permissions[_]
    operation := permission.operations[_]
    operation = input.operation
    permission.org_unit_ownership_constraint = true
    # if yes, one of user managingOrgUnits should match
    input.user.managing_org_units[_].id = data.elasticsearch.dataset.accessControlMetadata.org_unit_id
}

allowAccessEsDataset {
    input.path = "/resources/dataset"
    # if any pre-authoised constraints
    permission := input.user.permissions[_]
    operation := permission.operations[_]
    operation = input.operation
    permission.pre_authorised_constraint = true
    # if yes, it must listed on dataset's pre-authoised list
    data.elasticsearch.dataset.accessControlMetadata.pre_authoised_permissions[_] = operation
}
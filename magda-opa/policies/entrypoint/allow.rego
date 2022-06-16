package entrypoint

# When no rule match, the decision will be `denied` 
default allow = false

allow {
    # users with admin roles will have access to everything
    input.user.roles[_].id == "00000000-0000-0003-0000-000000000000"
}

allow {
    ## delegate generic record related decision to record_allow
    startswith(input.operationUri, "object/record/")
    data.object.record.allow
}

allow {
    ## delegate dataset related decision to dataset_allow
    startswith(input.operationUri, "object/dataset/")
    data.object.dataset.allow
}

allow {
    ## delegate organization related decision to organization_allow
    startswith(input.operationUri, "object/organization/")
    data.object.organization.allow
}

allow {
    ## delegate distribution related decision to organization_allow
    startswith(input.operationUri, "object/distribution/")
    data.object.distribution.allow
}

allow {
    ## delegate aspect related decision to aspect_allow
    startswith(input.operationUri, "object/aspect/")
    data.object.aspect.allow
}

allow {
    ## delegate webhook related decision to webhook rules
    startswith(input.operationUri, "object/webhook/")
    data.object.webhook.allow
}

allow {
    ## delegate event related decision to event rules
    startswith(input.operationUri, "object/event/")
    data.object.event.allow
}

allow {
    ## delegate content related decision to content_allowRead
    startswith(input.operationUri, "object/content/")
    
    ## Operation type must be read
    endswith(input.operationUri, "/read")

    data.object.content.allowRead
}

allow {
    ## delegate access group related decision to access group rules
    startswith(input.operationUri, "object/accessGroup/")
    data.object.accessGroup.allow
}

allow {
    ## delegate storage bucket related decision to storage bucket rules
    startswith(input.operationUri, "storage/bucket/")
    data.storage.bucket.allow
}

allow {
    ## delegate storage object related decision to storage object rules
    startswith(input.operationUri, "storage/object/")
    data.storage.object.allow
}

allow {
    startswith(input.operationUri, "authObject/apiKey/")
    data.authObject.apiKey.allow
}

allow {
    startswith(input.operationUri, "authObject/credential/")
    data.authObject.credential.allow
}

allow {
    startswith(input.operationUri, "authObject/operation/")
    data.authObject.operation.allow
}

allow {
    startswith(input.operationUri, "authObject/orgUnit/")
    data.authObject.orgUnit.allow
}

allow {
    startswith(input.operationUri, "authObject/permission/")
    data.authObject.permission.allow
}

allow {
    startswith(input.operationUri, "authObject/resource/")
    data.authObject.resource.allow
}

allow {
    startswith(input.operationUri, "authObject/role/")
    data.authObject.role.allow
}

allow {
    startswith(input.operationUri, "authObject/user/")
    data.authObject.user.allow
}
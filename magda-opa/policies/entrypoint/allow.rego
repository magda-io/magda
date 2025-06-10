package entrypoint

import rego.v1

# When no rule match, the decision will be `denied`
default allow := false

allow if {
	# users with admin roles will have access to everything
	input.user.roles[_].id == "00000000-0000-0003-0000-000000000000"
}

allow if {
	## delegate generic record related decision to record_allow
	startswith(input.operationUri, "object/record/")
	data.object.record.allow
}

allow if {
	## delegate dataset related decision to dataset_allow
	startswith(input.operationUri, "object/dataset/")
	data.object.dataset.allow
}

allow if {
	## delegate organization related decision to organization_allow
	startswith(input.operationUri, "object/organization/")
	data.object.organization.allow
}

allow if {
	## delegate distribution related decision to organization_allow
	startswith(input.operationUri, "object/distribution/")
	data.object.distribution.allow
}

allow if {
	## delegate aspect related decision to aspect_allow
	startswith(input.operationUri, "object/aspect/")
	data.object.aspect.allow
}

allow if {
	## delegate webhook related decision to webhook rules
	startswith(input.operationUri, "object/webhook/")
	data.object.webhook.allow
}

allow if {
	## delegate event related decision to event rules
	startswith(input.operationUri, "object/event/")
	data.object.event.allow
}

allow if {
	## delegate content related decision to content rules
	startswith(input.operationUri, "object/content/")
	data.object.content.allow
}

allow if {
	## delegate connector related decision to connector rules
	startswith(input.operationUri, "object/connector/")
	data.object.connector.allow
}

allow if {
	## delegate tenant related decision to tenant rules
	startswith(input.operationUri, "object/tenant/")
	data.object.tenant.allow
}

allow if {
	## delegate access group related decision to access group rules
	startswith(input.operationUri, "object/accessGroup/")
	data.object.accessGroup.allow
}

allow if {
	## delegate FaaS function related decision to FaaS function rules
	startswith(input.operationUri, "object/faas/function/")
	data.object.faas.function.allow
}

allow if {
	## delegate storage bucket related decision to storage bucket rules
	startswith(input.operationUri, "storage/bucket/")
	data.storage.bucket.allow
}

allow if {
	## delegate storage object related decision to storage object rules
	startswith(input.operationUri, "storage/object/")
	data.storage.object.allow
}

allow if {
	startswith(input.operationUri, "authObject/apiKey/")
	data.authObject.apiKey.allow
}

allow if {
	startswith(input.operationUri, "authObject/credential/")
	data.authObject.credential.allow
}

allow if {
	startswith(input.operationUri, "authObject/operation/")
	data.authObject.operation.allow
}

allow if {
	startswith(input.operationUri, "authObject/orgUnit/")
	data.authObject.orgUnit.allow
}

allow if {
	startswith(input.operationUri, "authObject/permission/")
	data.authObject.permission.allow
}

allow if {
	startswith(input.operationUri, "authObject/resource/")
	data.authObject.resource.allow
}

allow if {
	startswith(input.operationUri, "authObject/role/")
	data.authObject.role.allow
}

allow if {
	startswith(input.operationUri, "authObject/user/")
	data.authObject.user.allow
}

allow if {
	startswith(input.operationUri, "api/indexer/")
	data.api.indexer.allow
}

allow if {
	# allow all other api calls to generic gateway level enforcement policy based on HTTP request path & method
	startswith(input.operationUri, "api/")
	startswith(input.operationUri, "api/indexer/") != true
	data.api.allow
}

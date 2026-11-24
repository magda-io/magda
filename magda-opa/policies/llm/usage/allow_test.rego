package llm.usage

user_id := "00000000-0000-4000-8000-000000000123"

usage_permission := {
	"resourceUri": "llm/usage",
	"userOwnershipConstraint": false,
	"orgUnitOwnershipConstraint": false,
	"preAuthorisedConstraint": false,
	"allowExemption": false,
	"operations": [{"uri": "llm/usage/read"}],
}

usage_input(permissions) = i {
	i := {
		"operationUri": "llm/usage/read",
		"user": {"id": user_id, "roles": [], "permissions": permissions},
	}
}

test_allow_unconstrained_usage_read {
	allow with input as usage_input([usage_permission])
}

test_deny_constrained_usage_read {
	not allow with input as usage_input([
		object.union(usage_permission, {"userOwnershipConstraint": true}),
		object.union(usage_permission, {"orgUnitOwnershipConstraint": true}),
		object.union(usage_permission, {"preAuthorisedConstraint": true}),
	])
}

test_deny_without_permission {
	not allow with input as usage_input([])
}

test_deny_other_resource_permission {
	not allow with input as usage_input([object.union(usage_permission, {"resourceUri": "llm/access", "operations": [{"uri": "llm/access/read"}]})])
}

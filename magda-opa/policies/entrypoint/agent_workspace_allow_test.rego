package entrypoint

workspace_user_id := "00000000-0000-4000-8000-000000000456"

entrypoint_workspace_permission := {
	"resourceUri": "agentWorkspace",
	"userOwnershipConstraint": false,
	"orgUnitOwnershipConstraint": false,
	"preAuthorisedConstraint": false,
	"operations": [{"uri": "agentWorkspace/access"}],
}

test_entrypoint_delegates_agent_workspace_access {
	allow with input as {
		"operationUri": "agentWorkspace/access",
		"user": {"id": workspace_user_id, "roles": [], "permissions": [entrypoint_workspace_permission]},
	}
}

test_entrypoint_admin_keeps_agent_workspace_access {
	allow with input as {
		"operationUri": "agentWorkspace/access",
		"user": {
			"id": workspace_user_id,
			"roles": [{"id": "00000000-0000-0003-0000-000000000000"}],
			"permissions": [],
		},
	}
}

test_entrypoint_denies_agent_workspace_access_to_authenticated_users_by_default {
	not allow with input as {
		"operationUri": "agentWorkspace/access",
		"user": {
			"id": workspace_user_id,
			"roles": [{"id": "00000000-0000-0002-0000-000000000000"}],
			"permissions": [],
		},
	}
}

test_entrypoint_denies_agent_workspace_access_to_anonymous_users {
	not allow with input as {
		"operationUri": "agentWorkspace/access",
		"user": {
			"id": "",
			"roles": [{"id": "00000000-0000-0001-0000-000000000000"}],
			"permissions": [],
		},
	}
}

test_entrypoint_does_not_route_other_agent_workspace_operations {
	not allow with input as {
		"operationUri": "agentWorkspace/reset",
		"user": {"id": workspace_user_id, "roles": [], "permissions": [
			object.union(entrypoint_workspace_permission, {"operations": [{"uri": "agentWorkspace/reset"}]}),
		]},
	}
}

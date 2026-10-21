package agentWorkspace

user_id := "00000000-0000-4000-8000-000000000123"

workspace_permission := {
	"resourceUri": "agentWorkspace",
	"userOwnershipConstraint": false,
	"orgUnitOwnershipConstraint": false,
	"preAuthorisedConstraint": false,
	"operations": [{"uri": "agentWorkspace/access"}],
}

test_allow_granted_user {
	allow with input as {
		"operationUri": "agentWorkspace/access",
		"user": {"id": user_id, "roles": [], "permissions": [workspace_permission]},
	}
}

test_deny_unassigned_user {
	not allow with input as {
		"operationUri": "agentWorkspace/access",
		"user": {"id": user_id, "roles": [], "permissions": []},
	}
}

test_deny_anonymous_user_even_with_permission {
	not allow with input as {
		"operationUri": "agentWorkspace/access",
		"user": {"id": "", "roles": [], "permissions": [workspace_permission]},
	}
}

test_deny_missing_user_id {
	not allow with input as {
		"operationUri": "agentWorkspace/access",
		"user": {"roles": [], "permissions": [workspace_permission]},
	}
}

test_deny_constrained_permissions {
	not allow with input as {
		"operationUri": "agentWorkspace/access",
		"user": {"id": user_id, "roles": [], "permissions": [
			object.union(workspace_permission, {"userOwnershipConstraint": true}),
			object.union(workspace_permission, {"orgUnitOwnershipConstraint": true}),
			object.union(workspace_permission, {"preAuthorisedConstraint": true}),
		]},
	}
}

test_deny_other_operations_with_workspace_permission {
	not allow with input as {
		"operationUri": "agentWorkspace/admin",
		"user": {"id": user_id, "roles": [], "permissions": [workspace_permission]},
	}
}

test_deny_permission_on_other_resource {
	not allow with input as {
		"operationUri": "agentWorkspace/access",
		"user": {"id": user_id, "roles": [], "permissions": [
			object.union(workspace_permission, {"resourceUri": "object/agentSkill/user"}),
		]},
	}
}

test_skill_permissions_do_not_grant_workspace_access {
	not allow with input as {
		"operationUri": "agentWorkspace/access",
		"user": {"id": user_id, "roles": [], "permissions": [{
			"resourceUri": "object/agentSkill/user",
			"userOwnershipConstraint": true,
			"orgUnitOwnershipConstraint": false,
			"preAuthorisedConstraint": false,
			"operations": [{"uri": "object/agentSkill/user/read"}],
		}]},
	}
}

package entrypoint

llm_user_id := "00000000-0000-4000-8000-000000000123"

llm_profile := {"org_unit_id": "00000000-0000-4000-8000-00000000f000", "use_permission_id": "00000000-0000-4000-8000-0000000000aa", "constraint_exemption": false}

test_llm_access_invoke_delegated {
	allow with input as {
		"operationUri": "llm/access/invoke",
		"user": {"id": llm_user_id, "roles": [], "permissions": [{
			"id": "00000000-0000-4000-8000-0000000000aa",
			"resourceUri": "llm/access",
			"userOwnershipConstraint": false,
			"orgUnitOwnershipConstraint": false,
			"preAuthorisedConstraint": true,
			"operations": [{"uri": "llm/access/invoke"}],
		}]},
		"object": {"llmAccessProfile": llm_profile},
	}
}

test_llm_usage_read_delegated {
	allow with input as {
		"operationUri": "llm/usage/read",
		"user": {"id": llm_user_id, "roles": [], "permissions": [{
			"resourceUri": "llm/usage",
			"userOwnershipConstraint": false,
			"orgUnitOwnershipConstraint": false,
			"preAuthorisedConstraint": false,
			"operations": [{"uri": "llm/usage/read"}],
		}]},
	}
}

test_llm_admin_override {
	allow with input as {
		"operationUri": "llm/access/delete",
		"user": {"id": llm_user_id, "roles": [{"id": "00000000-0000-0003-0000-000000000000"}], "permissions": []},
	}
}

test_llm_no_permission_denied {
	not allow with input as {
		"operationUri": "llm/access/invoke",
		"user": {"id": llm_user_id, "roles": [], "permissions": []},
		"object": {"llmAccessProfile": llm_profile},
	}
}

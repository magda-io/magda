package object.agentSkill

system_read_permission := {
	"resourceUri": "object/agentSkill",
	"userOwnershipConstraint": false,
	"orgUnitOwnershipConstraint": false,
	"preAuthorisedConstraint": false,
	"operations": [{"uri": "object/agentSkill/read"}],
}

owner_permission := {
	"resourceUri": "object/agentSkill",
	"userOwnershipConstraint": true,
	"orgUnitOwnershipConstraint": false,
	"preAuthorisedConstraint": false,
	"operations": [
		{"uri": "object/agentSkill/create"},
		{"uri": "object/agentSkill/read"},
		{"uri": "object/agentSkill/update"},
		{"uri": "object/agentSkill/delete"},
	],
}

test_authenticated_user_can_read_system_skill {
	allow with input as {
		"operationUri": "object/agentSkill/read",
		"object": {"agentSkill": {
			"agent-skill": {"scope": "system"},
			"access-control": {"ownerId": "admin-id"},
		}},
		"user": {"id": "user-id", "permissions": [system_read_permission, owner_permission]},
	}
}

test_system_read_permission_does_not_expose_private_user_skill {
	not allow with input as {
		"operationUri": "object/agentSkill/read",
		"object": {"agentSkill": {
			"agent-skill": {"scope": "user"},
			"access-control": {"ownerId": "other-user-id"},
		}},
		"user": {"id": "user-id", "permissions": [system_read_permission]},
	}
}

test_owner_can_create_user_skill {
	allow with input as {
		"operationUri": "object/agentSkill/create",
		"object": {"agentSkill": {
			"agent-skill": {"scope": "user"},
			"access-control": {"ownerId": "user-id"},
		}},
		"user": {"id": "user-id", "permissions": [owner_permission]},
	}
}

test_owner_can_update_user_skill {
	allow with input as {
		"operationUri": "object/agentSkill/update",
		"object": {"agentSkill": {
			"agent-skill": {"scope": "user"},
			"access-control": {"ownerId": "user-id"},
		}},
		"user": {"id": "user-id", "permissions": [owner_permission]},
	}
}

test_owner_can_update_user_skill_with_unchanged_immutable_metadata {
	record := {
		"id": "agent-skill-user-id-useful-skill",
		"name": "useful-skill",
		"agent-skill": {
			"scope": "user",
			"createdAt": "2026-10-13T12:00:00Z",
			"createdBy": "user-id",
			"archiveKey": "agent-services/skills/user-skills/user-id/skill-id.zip",
		},
		"access-control": {"ownerId": "user-id"},
	}

	allow with input as {
		"operationUri": "object/agentSkill/update",
		"object": {"agentSkill": record, "originalRecord": record},
		"user": {"id": "user-id", "permissions": [owner_permission]},
	}
}

test_owner_cannot_change_immutable_user_skill_metadata {
	original := {
		"id": "agent-skill-user-id-useful-skill",
		"name": "useful-skill",
		"agent-skill": {
			"scope": "user",
			"createdAt": "2026-10-13T12:00:00Z",
			"createdBy": "user-id",
			"archiveKey": "agent-services/skills/user-skills/user-id/skill-id.zip",
		},
		"access-control": {"ownerId": "user-id"},
	}

	not allow with input as {
		"operationUri": "object/agentSkill/update",
		"object": {
			"agentSkill": object.union(original, {"agent-skill": object.union(original["agent-skill"], {"createdAt": "2026-10-14T12:00:00Z"})}),
			"originalRecord": original,
		},
		"user": {"id": "user-id", "permissions": [owner_permission]},
	}
}

test_owner_cannot_rename_user_skill {
	original := {
		"id": "agent-skill-user-id-useful-skill",
		"name": "useful-skill",
		"agent-skill": {
			"scope": "user",
			"createdAt": "2026-10-13T12:00:00Z",
			"createdBy": "user-id",
			"archiveKey": "agent-services/skills/user-skills/user-id/skill-id.zip",
		},
		"access-control": {"ownerId": "user-id"},
	}

	not allow with input as {
		"operationUri": "object/agentSkill/update",
		"object": {
			"agentSkill": object.union(original, {"name": "renamed-skill"}),
			"originalRecord": original,
		},
		"user": {"id": "user-id", "permissions": [owner_permission]},
	}
}

test_owner_cannot_change_user_skill_id {
	original := {
		"id": "agent-skill-user-id-useful-skill",
		"name": "useful-skill",
		"agent-skill": {
			"scope": "user",
			"createdAt": "2026-10-13T12:00:00Z",
			"createdBy": "user-id",
			"archiveKey": "agent-services/skills/user-skills/user-id/skill-id.zip",
		},
		"access-control": {"ownerId": "user-id"},
	}

	not allow with input as {
		"operationUri": "object/agentSkill/update",
		"object": {
			"agentSkill": object.union(original, {"id": "agent-skill-user-id-other-skill"}),
			"originalRecord": original,
		},
		"user": {"id": "user-id", "permissions": [owner_permission]},
	}
}

test_owner_can_delete_user_skill {
	allow with input as {
		"operationUri": "object/agentSkill/delete",
		"object": {"agentSkill": {
			"agent-skill": {"scope": "user"},
			"access-control": {"ownerId": "user-id"},
		}},
		"user": {"id": "user-id", "permissions": [owner_permission]},
	}
}

test_owner_permission_does_not_allow_other_user_skill {
	not allow with input as {
		"operationUri": "object/agentSkill/update",
		"object": {"agentSkill": {
			"agent-skill": {"scope": "user"},
			"access-control": {"ownerId": "other-user-id"},
		}},
		"user": {"id": "user-id", "permissions": [owner_permission]},
	}
}

test_non_admin_cannot_mutate_system_skill {
	not allow with input as {
		"operationUri": "object/agentSkill/update",
		"object": {"agentSkill": {
			"agent-skill": {"scope": "system"},
			"access-control": {"ownerId": "user-id"},
		}},
		"user": {"id": "user-id", "permissions": [system_read_permission, owner_permission]},
	}
}

test_anonymous_cannot_read_system_skill {
	not allow with input as {
		"operationUri": "object/agentSkill/read",
		"object": {"agentSkill": {
			"agent-skill": {"scope": "system"},
			"access-control": {"ownerId": "admin-id"},
		}},
		"user": {},
	}
}

test_unknown_scope_fails_closed {
	not allow with input as {
		"operationUri": "object/agentSkill/read",
		"object": {"agentSkill": {
			"agent-skill": {"scope": "shared"},
			"access-control": {"ownerId": "user-id"},
		}},
		"user": {"id": "user-id", "permissions": [system_read_permission, owner_permission]},
	}
}

test_unknown_operation_fails_closed {
	not allow with input as {
		"operationUri": "object/agentSkill/publish",
		"object": {"agentSkill": {
			"agent-skill": {"scope": "user"},
			"access-control": {"ownerId": "user-id"},
		}},
		"user": {"id": "user-id", "permissions": [owner_permission]},
	}
}

test_pre_authorised_only_permission_does_not_grant_owner_access {
	not allow with input as {
		"operationUri": "object/agentSkill/read",
		"object": {"agentSkill": {
			"agent-skill": {"scope": "user"},
			"access-control": {"ownerId": "user-id"},
		}},
		"user": {"id": "user-id", "permissions": [{
			"resourceUri": "object/agentSkill",
			"userOwnershipConstraint": false,
			"orgUnitOwnershipConstraint": false,
			"preAuthorisedConstraint": true,
			"operations": [{"uri": "object/agentSkill/read"}],
		}]},
	}
}

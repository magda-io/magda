package object.record

agent_system_read_permission := {
	"resourceUri": "object/agentSkill",
	"userOwnershipConstraint": false,
	"orgUnitOwnershipConstraint": false,
	"preAuthorisedConstraint": false,
	"operations": [{"uri": "object/agentSkill/read"}],
}

agent_owner_permission := {
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

generic_record_permission := {
	"resourceUri": "object/record",
	"userOwnershipConstraint": false,
	"orgUnitOwnershipConstraint": false,
	"preAuthorisedConstraint": false,
	"operations": [
		{"uri": "object/record/create"},
		{"uri": "object/record/read"},
		{"uri": "object/record/update"},
		{"uri": "object/record/delete"},
	],
}

test_typed_system_skill_delegates_to_agent_skill_read {
	allow with input as {
		"operationUri": "object/record/read",
		"object": {"record": {
			"id": "skill-id",
			"agent-skill": {"scope": "system"},
			"access-control": {"ownerId": "admin-id"},
		}},
		"user": {"id": "user-id", "permissions": [agent_system_read_permission]},
	}
}

test_generic_record_grant_cannot_read_private_agent_skill {
	not allow with input as {
		"operationUri": "object/record/read",
		"object": {"record": {
			"id": "skill-id",
			"agent-skill": {"scope": "user"},
			"access-control": {"ownerId": "other-user-id"},
		}},
		"user": {"id": "user-id", "permissions": [generic_record_permission, agent_system_read_permission]},
	}
}

test_owner_agent_skill_grant_allows_typed_user_record {
	allow with input as {
		"operationUri": "object/record/update",
		"object": {"record": {
			"id": "skill-id",
			"agent-skill": {"scope": "user"},
			"access-control": {"ownerId": "user-id"},
		}},
		"user": {"id": "user-id", "permissions": [agent_owner_permission]},
	}
}

test_generic_create_grant_cannot_create_typed_agent_skill {
	not allow with input as {
		"operationUri": "object/record/create",
		"object": {"record": {
			"id": "skill-id",
			"agent-skill": {"scope": "user"},
			"access-control": {"ownerId": "user-id"},
		}},
		"user": {"id": "user-id", "permissions": [generic_record_permission]},
	}
}

test_owner_cannot_change_user_skill_to_system_scope {
	not allow with input as {
		"operationUri": "object/record/update",
		"object": {"record": {
			"id": "skill-id",
			"agent-skill": {"scope": "system"},
			"access-control": {"ownerId": "user-id"},
		}},
		"user": {"id": "user-id", "permissions": [agent_owner_permission, generic_record_permission]},
	}
}

test_owner_cannot_transfer_user_skill_to_another_owner {
	not allow with input as {
		"operationUri": "object/record/update",
		"object": {"record": {
			"id": "skill-id",
			"agent-skill": {"scope": "user"},
			"access-control": {"ownerId": "other-user-id"},
		}},
		"user": {"id": "user-id", "permissions": [agent_owner_permission, generic_record_permission]},
	}
}

test_owner_cannot_change_agent_skill_created_at {
	not allow with input as {
		"operationUri": "object/record/update",
		"object": {
			"record": {
				"id": "skill-id",
				"name": "useful-skill",
				"agent-skill": {
					"scope": "user",
					"createdAt": "2026-10-14T12:00:00Z",
					"createdBy": "user-id",
					"archiveKey": "agent-services/skills/user-skills/user-id/skill-id.zip",
				},
				"access-control": {"ownerId": "user-id"},
			},
			"originalRecord": {
				"id": "skill-id",
				"name": "useful-skill",
				"agent-skill": {
					"scope": "user",
					"createdAt": "2026-10-13T12:00:00Z",
					"createdBy": "user-id",
					"archiveKey": "agent-services/skills/user-skills/user-id/skill-id.zip",
				},
				"access-control": {"ownerId": "user-id"},
			},
		},
		"user": {"id": "user-id", "permissions": [agent_owner_permission, generic_record_permission]},
	}
}

test_owner_cannot_rename_agent_skill_through_generic_record_update {
	original := {
		"id": "skill-id",
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
		"operationUri": "object/record/update",
		"object": {
			"record": object.union(original, {"name": "renamed-skill"}),
			"originalRecord": original,
		},
		"user": {"id": "user-id", "permissions": [agent_owner_permission, generic_record_permission]},
	}
}

test_owner_cannot_change_agent_skill_id_through_generic_record_update {
	original := {
		"id": "skill-id",
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
		"operationUri": "object/record/update",
		"object": {
			"record": object.union(original, {"id": "other-skill-id"}),
			"originalRecord": original,
		},
		"user": {"id": "user-id", "permissions": [agent_owner_permission, generic_record_permission]},
	}
}

test_agent_skill_cannot_bypass_policy_with_other_typed_markers {
	not allow with input as {
		"operationUri": "object/record/read",
		"object": {"record": {
			"id": "skill-id",
			"agent-skill": {"scope": "user"},
			"organization-details": {},
			"dcat-dataset-strings": {},
			"publishing": {"state": "published"},
			"access-control": {"ownerId": "other-user-id"},
		}},
		"user": {"id": "user-id", "permissions": [generic_record_permission]},
	}
}

test_agent_skill_aspect_removal_cannot_fall_through_generic_policy {
	not allow with input as {
		"operationUri": "object/record/update",
		"object": {
			"record": {
				"id": "skill-id",
				"access-control": {"ownerId": "user-id"},
			},
			"originalRecord": {
				"id": "skill-id",
				"name": "useful-skill",
				"agent-skill": {"scope": "user"},
				"access-control": {"ownerId": "user-id"},
			},
		},
		"user": {"id": "user-id", "permissions": [agent_owner_permission, generic_record_permission]},
	}
}

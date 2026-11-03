package entrypoint

user_id := "00000000-0000-4000-8000-000000000123"

entrypoint_system_admin_permission := {
	"resourceUri": "object/agentSkill/system",
	"userOwnershipConstraint": false,
	"orgUnitOwnershipConstraint": false,
	"preAuthorisedConstraint": false,
	"allowExemption": false,
	"operations": [
		{"uri": "object/agentSkill/system/create"},
		{"uri": "object/agentSkill/system/read"},
		{"uri": "object/agentSkill/system/update"},
		{"uri": "object/agentSkill/system/delete"},
	],
}

system_record := {
	"id": "agent-skill-system-useful-skill",
	"name": "system-useful-skill",
	"agent-skill": {
		"name": "system-useful-skill",
		"type": "system",
		"archiveKey": "agent-services/skills/system-skills/agent-skill-system-useful-skill.zip",
	},
	"access-control": {"ownerId": user_id},
}

test_entrypoint_delegates_typed_agent_skill_operation {
	allow with input as {
		"operationUri": "object/agentSkill/system/update",
		"object": {"agentSkill": system_record},
		"user": {"id": user_id, "roles": [], "permissions": [entrypoint_system_admin_permission]},
	}
}

test_entrypoint_admin_override_remains {
	allow with input as {
		"operationUri": "object/agentSkill/system/delete",
		"object": {"agentSkill": system_record},
		"user": {
			"id": user_id,
			"roles": [{"id": "00000000-0000-0003-0000-000000000000"}],
			"permissions": [],
		},
	}
}

test_entrypoint_default_admin_can_inspect_reserved_skill_archive {
	allow with input as {
		"operationUri": "storage/object/read",
		"storage": {"object": {
			"name": system_record["agent-skill"].archiveKey,
			"recordId": system_record.id,
			"ownerId": user_id,
			"exists": true,
		}},
		"object": {"record": system_record},
		"user": {
			"id": "00000000-0000-4000-8000-000000000000",
			"roles": [{"id": "00000000-0000-0003-0000-000000000000"}],
			"permissions": [],
		},
	}
}

test_unsuffixed_operation_is_not_delegated_to_a_grant {
	not allow with input as {
		"operationUri": "object/agentSkill/read",
		"object": {"agentSkill": system_record},
		"user": {"id": user_id, "roles": [], "permissions": [entrypoint_system_admin_permission]},
	}
}

installation_recipient := "00000000-0000-4000-8000-0000000000b0"

installation_permission := {
	"resourceUri": "object/agentSkill/install",
	"userOwnershipConstraint": true,
	"orgUnitOwnershipConstraint": false,
	"preAuthorisedConstraint": false,
	"operations": [
		{"uri": "object/agentSkill/install/create"},
		{"uri": "object/agentSkill/install/delete"},
	],
}

installation_record := {
	"id": sprintf("agent-skill-%s-csv-reporter", [installation_recipient]),
	"name": "csv-reporter",
	"agent-skill-installation": {
		"userId": installation_recipient,
		"sourceSkillId": "agent-skill-00000000-0000-4000-8000-0000000000a1-csv-reporter",
		"createdAt": "2026-10-21T00:00:00Z",
	},
	"access-control": {"ownerId": installation_recipient},
}

test_entrypoint_routes_installation_decisions_to_typed_rules {
	allow with input as {
		"operationUri": "object/agentSkill/install/create",
		"object": {"agentSkillInstallation": installation_record},
		"user": {"id": installation_recipient, "permissions": [installation_permission]},
	}

	allow with input as {
		"operationUri": "object/agentSkill/install/delete",
		"object": {"agentSkillInstallation": installation_record},
		"user": {"id": installation_recipient, "permissions": [installation_permission]},
	}
}

test_entrypoint_installation_decisions_stay_owner_scoped {
	not allow with input as {
		"operationUri": "object/agentSkill/install/create",
		"object": {"agentSkillInstallation": installation_record},
		"user": {"id": "00000000-0000-4000-8000-0000000000c3", "permissions": [installation_permission]},
	}

	not allow with input as {
		"operationUri": "object/agentSkill/install/update",
		"object": {"agentSkillInstallation": installation_record},
		"user": {"id": installation_recipient, "permissions": [installation_permission]},
	}
}

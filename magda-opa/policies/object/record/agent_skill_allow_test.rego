package object.record

user_id := "00000000-0000-4000-8000-000000000123"

other_id := "00000000-0000-4000-8000-000000000456"

agent_owner_permission := {
	"resourceUri": "object/agentSkill/user",
	"userOwnershipConstraint": true,
	"orgUnitOwnershipConstraint": false,
	"preAuthorisedConstraint": false,
	"allowExemption": false,
	"operations": [
		{"uri": "object/agentSkill/user/create"},
		{"uri": "object/agentSkill/user/read"},
		{"uri": "object/agentSkill/user/update"},
		{"uri": "object/agentSkill/user/delete"},
	],
}

system_admin_permission := {
	"resourceUri": "object/agentSkill/system",
	"userOwnershipConstraint": false,
	"orgUnitOwnershipConstraint": false,
	"preAuthorisedConstraint": false,
	"operations": [{"uri": "object/agentSkill/system/update"}],
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

# a generic record grant with ownership constraint
owner_generic_record_permission := object.union(generic_record_permission, {"userOwnershipConstraint": true})

# an unconstrained typed (not generic) grant
published_dataset_read_permission := {
	"resourceUri": "object/dataset/published",
	"userOwnershipConstraint": false,
	"orgUnitOwnershipConstraint": false,
	"preAuthorisedConstraint": false,
	"operations": [{"uri": "object/dataset/published/read"}],
}

system_record := {
	"id": "agent-skill-system-useful-skill",
	"name": "system-useful-skill",
	"agent-skill": {"name": "system-useful-skill", "type": "system", "createdAt": "2026-10-15T00:00:00Z", "createdBy": other_id, "archiveKey": "agent-services/skills/system-skills/agent-skill-system-useful-skill.zip"},
	"access-control": {"ownerId": other_id},
}

record_operations := ["create", "read", "update", "delete"]

user_record(owner, target) = {
	"id": sprintf("agent-skill-%s-useful-skill", [target]),
	"name": "useful-skill",
	"agent-skill": {
		"name": "useful-skill",
		"type": "user",
		"userId": target,
		"createdAt": "2026-10-15T00:00:00Z",
		"createdBy": owner,
		"archiveKey": sprintf("agent-services/skills/user-skills/%s/agent-skill-%s-useful-skill.zip", [target, target]),
	},
	"access-control": {"ownerId": owner},
}

test_owner_agent_skill_grant_reads_own_user_record {
	allow with input as {
		"operationUri": "object/record/read",
		"object": {"record": user_record(user_id, user_id)},
		"user": {"id": user_id, "permissions": [agent_owner_permission]},
	}
}

# Agent Services writes Agent Skill records with its internal admin session,
# after authorising its caller with the typed operations.
test_typed_agent_skill_grants_cannot_write_via_generic_record_operations {
	every_denied := [operation |
		operation := ["create", "update", "delete"][_]
		not allow with input as {
			"operationUri": concat("/", ["object/record", operation]),
			"object": {"record": user_record(user_id, user_id)},
			"user": {"id": user_id, "permissions": [agent_owner_permission]},
		}
	]

	count(every_denied) == 3

	not allow with input as {
		"operationUri": "object/record/update",
		"object": {"record": system_record},
		"user": {"id": user_id, "permissions": [system_admin_permission]},
	}
}

test_unconstrained_generic_record_grant_applies_to_agent_skill_records {
	allowed := [operation |
		operation := record_operations[_]
		record := [user_record(other_id, other_id), system_record][_]
		allow with input as {
			"operationUri": concat("/", ["object/record", operation]),
			"object": {"record": record},
			"user": {"id": user_id, "permissions": [generic_record_permission]},
		}
	]

	count(allowed) == 8
}

test_constrained_generic_record_grant_cannot_access_agent_skill_records {
	denied := [operation |
		operation := record_operations[_]
		not allow with input as {
			"operationUri": concat("/", ["object/record", operation]),
			"object": {"record": user_record(user_id, user_id)},
			"user": {"id": user_id, "permissions": [owner_generic_record_permission]},
		}
	]

	count(denied) == 4
}

test_agent_skill_cannot_bypass_policy_with_other_typed_markers {
	record := object.union(user_record(other_id, other_id), {
		"organization-details": {},
		"dcat-dataset-strings": {},
		"publishing": {"state": "published"},
	})

	not allow with input as {
		"operationUri": "object/record/read",
		"object": {"record": record},
		"user": {"id": user_id, "permissions": [published_dataset_read_permission]},
	}
}

test_installation_marker_fails_closed_for_constrained_grants_until_3861 {
	installation := {"id": sprintf("agent-skill-%s-shared-skill", [user_id]), "name": "shared-skill", "agent-skill-installation": {"userId": user_id, "sourceSkillId": "source"}, "access-control": {"ownerId": user_id}}
	not allow with input as {
		"operationUri": "object/record/read",
		"object": {"record": installation},
		"user": {"id": user_id, "permissions": [owner_generic_record_permission]},
	}
}

test_installation_marker_fails_closed_even_with_unreserved_id {
	installation := {"id": "ordinary-record", "name": "shared-skill", "agent-skill-installation": {"userId": user_id, "sourceSkillId": "source"}, "access-control": {"ownerId": user_id}}
	not allow with input as {
		"operationUri": "object/record/read",
		"object": {"record": installation},
		"user": {"id": user_id, "permissions": [owner_generic_record_permission]},
	}
}

test_unconstrained_generic_record_grant_applies_to_installation_records {
	installation := {"id": "ordinary-record", "name": "shared-skill", "agent-skill-installation": {"userId": other_id, "sourceSkillId": "source"}, "access-control": {"ownerId": other_id}}
	allow with input as {
		"operationUri": "object/record/read",
		"object": {"record": installation},
		"user": {"id": user_id, "permissions": [generic_record_permission]},
	}
}

test_untyped_reserved_looking_id_still_uses_generic_policy {
	allow with input as {
		"operationUri": "object/record/update",
		"object": {"record": {"id": "agent-skill-generic-record", "access-control": {"ownerId": user_id}}},
		"user": {"id": user_id, "permissions": [generic_record_permission]},
	}
}

test_unrelated_generic_record_still_uses_generic_policy {
	allow with input as {
		"operationUri": "object/record/update",
		"object": {"record": {"id": "ordinary-record", "access-control": {"ownerId": user_id}}},
		"user": {"id": user_id, "permissions": [generic_record_permission]},
	}
}

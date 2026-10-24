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

test_generic_record_grant_cannot_read_installation {
	installation := {"id": sprintf("agent-skill-%s-shared-skill", [user_id]), "name": "shared-skill", "agent-skill-installation": {"userId": user_id, "sourceSkillId": "source"}, "access-control": {"ownerId": user_id}}
	not allow with input as {
		"operationUri": "object/record/read",
		"object": {"record": installation},
		"user": {"id": user_id, "permissions": [owner_generic_record_permission]},
	}
}

test_generic_record_grant_cannot_read_installation_with_unreserved_id {
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

# ---------------------------------------------------------------- #3861

recipient_id := "00000000-0000-4000-8000-0000000000b0"

share_permission_id := "00000000-0000-4000-8000-00000000c0de"

install_owner_permission := {
	"id": "00000000-3854-4100-8000-000000000006",
	"resourceUri": "object/agentSkill/install",
	"userOwnershipConstraint": true,
	"orgUnitOwnershipConstraint": false,
	"preAuthorisedConstraint": false,
	"operations": [
		{"uri": "object/agentSkill/install/create"},
		{"uri": "object/agentSkill/install/read"},
		{"uri": "object/agentSkill/install/update"},
		{"uri": "object/agentSkill/install/delete"},
	],
}

# The source-scoped Access Group permission for one shared publication.
share_permission(resource, operation) = {
	"id": share_permission_id,
	"resourceUri": resource,
	"userOwnershipConstraint": false,
	"orgUnitOwnershipConstraint": false,
	"preAuthorisedConstraint": true,
	"allowExemption": false,
	"operations": [{"uri": operation}],
}

recipient_installation := {
	"id": sprintf("agent-skill-%s-useful-skill", [recipient_id]),
	"name": "useful-skill",
	"agent-skill-installation": {
		"userId": recipient_id,
		"sourceSkillId": sprintf("agent-skill-%s-useful-skill", [other_id]),
		"createdAt": "2026-10-21T00:00:00Z",
	},
	"access-control": {"ownerId": recipient_id},
}

shared_source := object.union(user_record(other_id, other_id), {"access-control": {
	"ownerId": other_id,
	"preAuthorisedPermissionIds": [share_permission_id],
}})

record_decision(operation, record, permissions) {
	allow with input as {
		"operationUri": sprintf("object/record/%s", [operation]),
		"object": {"record": record},
		"user": {"id": recipient_id, "permissions": permissions},
	}
}

# Installations are read with the typed read rules. Like publications, they're
# written by Agent Services only (with its internal session), after it
# authorises the caller with the typed installation operations.
test_installation_record_reads_use_typed_rules_and_writes_are_reserved {
	record_decision("read", recipient_installation, [install_owner_permission])
	not record_decision("create", recipient_installation, [install_owner_permission])
	not record_decision("update", recipient_installation, [install_owner_permission])
	not record_decision("delete", recipient_installation, [install_owner_permission])
}

# Unconstrained generic grants apply to every record (see
# test_unconstrained_generic_record_grant_applies_to_installation_records).
test_constrained_generic_record_grants_never_authorize_installations {
	not record_decision("create", recipient_installation, [owner_generic_record_permission])
	not record_decision("read", recipient_installation, [owner_generic_record_permission])
	not record_decision("delete", recipient_installation, [owner_generic_record_permission])
}

test_record_with_both_markers_fails_closed {
	both := object.union(shared_source, {"agent-skill-installation": recipient_installation["agent-skill-installation"]})
	not record_decision("read", both, [share_permission("object/agentSkill/user", "object/agentSkill/user/read")])
	not record_decision("read", both, [install_owner_permission, owner_generic_record_permission])
}

test_installation_existence_never_grants_source_read {
	not record_decision("read", user_record(other_id, other_id), [install_owner_permission])
	not record_decision("read", shared_source, [install_owner_permission])
}

test_no_source_read_before_sharing {
	unshared := user_record(other_id, other_id)
	not record_decision("read", unshared, [share_permission("object/agentSkill/user", "object/agentSkill/user/read")])
}

test_attached_group_permission_grants_typed_source_read {
	record_decision("read", shared_source, [share_permission("object/agentSkill/user", "object/agentSkill/user/read")])
}

test_revoked_membership_denies_source_read {
	not record_decision("read", shared_source, [])
}

test_group_permission_grants_no_source_write {
	permission := share_permission("object/agentSkill/user", "object/agentSkill/user/read")
	not record_decision("update", shared_source, [permission])
	not record_decision("delete", shared_source, [permission])
}

test_generic_record_read_share_cannot_read_agent_skill {
	not record_decision("read", shared_source, [share_permission("object/record", "object/record/read")])
}

test_user_share_permission_cannot_read_system_skill {
	system := {
		"id": "agent-skill-system-useful-skill",
		"name": "system-useful-skill",
		"agent-skill": {"name": "system-useful-skill", "type": "system"},
		"access-control": {"ownerId": other_id, "preAuthorisedPermissionIds": [share_permission_id]},
	}

	not record_decision("read", system, [share_permission("object/agentSkill/user", "object/agentSkill/user/read")])
	record_decision("read", system, [share_permission("object/agentSkill/system", "object/agentSkill/system/read")])
}

test_missing_or_empty_org_unit_never_grants_skill_read {
	org_read := {
		"resourceUri": "object/agentSkill/user",
		"userOwnershipConstraint": false,
		"orgUnitOwnershipConstraint": true,
		"preAuthorisedConstraint": false,
		"allowExemption": true,
		"operations": [{"uri": "object/agentSkill/user/read"}],
	}

	not allow with input as {
		"operationUri": "object/record/read",
		"object": {"record": user_record(other_id, other_id)},
		"user": {"id": recipient_id, "permissions": [org_read], "managingOrgUnitIds": [""]},
	}

	empty := object.union(user_record(other_id, other_id), {"access-control": {"ownerId": other_id, "orgUnitId": ""}})
	not allow with input as {
		"operationUri": "object/record/read",
		"object": {"record": empty},
		"user": {"id": recipient_id, "permissions": [org_read], "managingOrgUnitIds": [""]},
	}
}

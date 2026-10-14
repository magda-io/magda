package object.agentSkill

user_id := "00000000-0000-4000-8000-000000000123"

other_id := "00000000-0000-4000-8000-000000000456"

permission(resource, operations, owner, org, preauth, exemption) = {
	"id": "00000000-0000-4000-8000-000000000777",
	"resourceUri": resource,
	"userOwnershipConstraint": owner,
	"orgUnitOwnershipConstraint": org,
	"preAuthorisedConstraint": preauth,
	"allowExemption": exemption,
	"operations": [{"uri": operation} | operation := operations[_]],
}

owner_permission := permission(
	"object/agentSkill/user", [
		"object/agentSkill/user/create",
		"object/agentSkill/user/read",
		"object/agentSkill/user/update",
		"object/agentSkill/user/delete",
	],
	true, false, false, false,
)

system_admin_permission := permission(
	"object/agentSkill/system", [
		"object/agentSkill/system/create",
		"object/agentSkill/system/read",
		"object/agentSkill/system/update",
		"object/agentSkill/system/delete",
	],
	false, false, false, false,
)

system_org_read := permission("object/agentSkill/system", ["object/agentSkill/system/read"], false, true, false, true)

user_org_read := permission("object/agentSkill/user", ["object/agentSkill/user/read"], false, true, false, true)

system_preauth_read := permission("object/agentSkill/system", ["object/agentSkill/system/read"], false, false, true, true)

user_preauth_read := permission("object/agentSkill/user", ["object/agentSkill/user/read"], false, false, true, true)

user_record(owner, target) = {
	"id": sprintf("agent-skill-%s-useful-skill", [target]),
	"name": "useful-skill",
	"agent-skill": {
		"name": "useful-skill",
		"type": "user",
		"userId": target,
		"archiveKey": sprintf("agent-services/skills/user-skills/%s/agent-skill-%s-useful-skill.zip", [target, target]),
	},
	"access-control": {"ownerId": owner},
}

system_record := {
	"id": "agent-skill-system-useful-skill",
	"name": "system-useful-skill",
	"agent-skill": {
		"name": "system-useful-skill",
		"type": "system",
		"archiveKey": "agent-services/skills/system-skills/agent-skill-system-useful-skill.zip",
	},
	"access-control": {"ownerId": other_id},
}

test_owner_can_create_self_targeted_user_skill {
	verifyPermission("object/agentSkill/user/create", "agentSkill") with input as {
		"operationUri": "object/agentSkill/user/create",
		"object": {"agentSkill": user_record(user_id, user_id)},
		"user": {"id": user_id, "permissions": [owner_permission]},
	}
}

test_owner_cannot_forge_another_target_user {
	not verifyPermission("object/agentSkill/user/create", "agentSkill") with input as {
		"object": {"agentSkill": user_record(user_id, other_id)},
		"user": {"id": user_id, "permissions": [owner_permission]},
	}
}

test_unconstrained_user_create_does_not_enable_delegated_provisioning {
	broad_create := permission("object/agentSkill/user", ["object/agentSkill/user/create"], false, false, false, false)
	not verifyPermission("object/agentSkill/user/create", "agentSkill") with input as {
		"object": {"agentSkill": user_record(other_id, other_id)},
		"user": {"id": user_id, "permissions": [broad_create]},
	}
}

test_owner_can_read_own_user_skill {
	verifyPermission("object/agentSkill/user/read", "agentSkill") with input as {
		"object": {"agentSkill": user_record(user_id, user_id)},
		"user": {"id": user_id, "permissions": [owner_permission]},
	}
}

test_unassigned_user_cannot_read_private_user_skill {
	not verifyPermission("object/agentSkill/user/read", "agentSkill") with input as {
		"object": {"agentSkill": user_record(other_id, other_id)},
		"user": {"id": user_id, "permissions": []},
	}
}

test_non_admin_system_publisher_can_mutate {
	verifyPermission("object/agentSkill/system/update", "agentSkill") with input as {
		"object": {"agentSkill": system_record},
		"user": {"id": user_id, "permissions": [system_admin_permission]},
	}
}

test_org_unit_read_requires_actual_nonempty_match {
	record := object.union(system_record, {"access-control": {"ownerId": other_id, "orgUnitId": "org-1"}})
	verifyPermission("object/agentSkill/system/read", "agentSkill") with input as {
		"object": {"agentSkill": record},
		"user": {"id": user_id, "managingOrgUnitIds": ["org-1"], "permissions": [system_org_read]},
	}
}

test_missing_org_unit_does_not_inherit_generic_read_fallback {
	not verifyPermission("object/agentSkill/system/read", "agentSkill") with input as {
		"object": {"agentSkill": system_record},
		"user": {"id": user_id, "managingOrgUnitIds": ["org-1"], "permissions": [system_org_read]},
	}
}

test_empty_org_unit_is_not_a_match {
	record := object.union(system_record, {"access-control": {"ownerId": other_id, "orgUnitId": ""}})
	not verifyPermission("object/agentSkill/system/read", "agentSkill") with input as {
		"object": {"agentSkill": record},
		"user": {"id": user_id, "managingOrgUnitIds": [""], "permissions": [system_org_read]},
	}
}

test_exact_pre_authorised_permission_reads_user_skill {
	record := object.union(user_record(other_id, other_id), {"access-control": {"ownerId": other_id, "preAuthorisedPermissionIds": [user_preauth_read.id]}})
	verifyPermission("object/agentSkill/user/read", "agentSkill") with input as {
		"object": {"agentSkill": record},
		"user": {"id": user_id, "permissions": [user_preauth_read]},
	}
}

test_unrelated_pre_authorised_permission_is_denied {
	record := object.union(system_record, {"access-control": {"ownerId": other_id, "preAuthorisedPermissionIds": ["00000000-0000-4000-8000-000000000999"]}})
	not verifyPermission("object/agentSkill/system/read", "agentSkill") with input as {
		"object": {"agentSkill": record},
		"user": {"id": user_id, "permissions": [system_preauth_read]},
	}
}

test_exempt_publication_accepts_matching_exemptible_typed_read {
	record := object.union(system_record, {"access-control": {"ownerId": other_id, "constraintExemption": true}})
	verifyPermission("object/agentSkill/system/read", "agentSkill") with input as {
		"object": {"agentSkill": record},
		"user": {"id": user_id, "permissions": [system_org_read]},
	}
}

test_system_read_never_exposes_user_publication {
	not verifyPermission("object/agentSkill/system/read", "agentSkill") with input as {
		"object": {"agentSkill": user_record(other_id, other_id)},
		"user": {"id": user_id, "permissions": [system_org_read, system_preauth_read]},
	}
}

test_identity_mismatch_write_fails_closed {
	bad := object.union(user_record(user_id, user_id), {"id": "agent-skill-forged"})
	not verifyPermission("object/agentSkill/user/update", "agentSkill") with input as {
		"object": {"agentSkill": bad},
		"user": {"id": user_id, "permissions": [owner_permission]},
	}
}

test_unknown_or_install_operation_fails_closed {
	not verifyPermission("object/agentSkill/install/read", "agentSkill") with input as {
		"object": {"agentSkill": user_record(user_id, user_id)},
		"user": {"id": user_id, "permissions": [owner_permission]},
	}
}

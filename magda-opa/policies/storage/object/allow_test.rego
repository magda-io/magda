package storage.object

storagePermission(operationUri, owner, org) = {
	"id": "8f6b3c1e-1c4b-4c0e-9d2b-7a3f2f6c9a10",
	"name": "Storage Object Permission",
	"resourceUri": "storage/object",
	"userOwnershipConstraint": owner,
	"orgUnitOwnershipConstraint": org,
	"preAuthorisedConstraint": false,
	"allowExemption": false,
	"operations": [{"uri": operationUri}],
}

ownerConstraintUser(userId, operationUri) = user {
	user := {
		"id": userId,
		"permissions": [storagePermission(operationUri, true, false)],
		"managingOrgUnitIds": [],
	}
}

storageReader(userId, owner, org, managingOrgUnitIds) = {
	"id": userId,
	"permissions": [storagePermission("storage/object/read", owner, org)],
	"managingOrgUnitIds": managingOrgUnitIds,
}

test_allow_owner_constraint_read_own_object {
	allow with input as {
		"operationUri": "storage/object/read",
		"user": ownerConstraintUser("user-a", "storage/object/read"),
		"storage": {"object": {
			"bucketName": "magda-datasets",
			"name": "ds-1/dist-1/data.csv",
			"ownerId": "user-a",
		}},
	}
}

test_not_allow_owner_constraint_read_other_users_object {
	not allow with input as {
		"operationUri": "storage/object/read",
		"user": ownerConstraintUser("user-b", "storage/object/read"),
		"storage": {"object": {
			"bucketName": "magda-datasets",
			"name": "ds-1/dist-1/data.csv",
			"ownerId": "user-a",
		}},
	}
}

test_not_allow_owner_constraint_read_object_without_owner {
	not allow with input as {
		"operationUri": "storage/object/read",
		"user": ownerConstraintUser("user-a", "storage/object/read"),
		"storage": {"object": {
			"bucketName": "magda-datasets",
			"name": "ds-1/dist-1/data.csv",
		}},
	}
}

test_allow_owner_constraint_upload_own_object {
	allow with input as {
		"operationUri": "storage/object/upload",
		"user": ownerConstraintUser("user-a", "storage/object/upload"),
		"storage": {"object": {
			"bucketName": "magda-datasets",
			"name": "ds-1/dist-1/data.csv",
			"ownerId": "user-a",
			"size": 1024,
		}},
	}
}

test_not_allow_owner_constraint_upload_other_users_object {
	not allow with input as {
		"operationUri": "storage/object/upload",
		"user": ownerConstraintUser("user-b", "storage/object/upload"),
		"storage": {"object": {
			"bucketName": "magda-datasets",
			"name": "ds-1/dist-1/data.csv",
			"ownerId": "user-a",
			"size": 1024,
		}},
	}
}

test_allow_owner_constraint_delete_own_object {
	allow with input as {
		"operationUri": "storage/object/delete",
		"user": ownerConstraintUser("user-a", "storage/object/delete"),
		"storage": {"object": {
			"bucketName": "magda-datasets",
			"name": "ds-1/dist-1/data.csv",
			"ownerId": "user-a",
		}},
	}
}

test_not_allow_owner_constraint_delete_other_users_object {
	not allow with input as {
		"operationUri": "storage/object/delete",
		"user": ownerConstraintUser("user-b", "storage/object/delete"),
		"storage": {"object": {
			"bucketName": "magda-datasets",
			"name": "ds-1/dist-1/data.csv",
			"ownerId": "user-a",
		}},
	}
}

system_skill := {
	"id": "agent-skill-system-useful-skill",
	"name": "system-useful-skill",
	"agent-skill": {
		"name": "system-useful-skill",
		"type": "system",
		"createdBy": "00000000-0000-4000-8000-000000000456",
		"updatedBy": "00000000-0000-4000-8000-000000000456",
		"archiveKey": "agent-services/skills/system-skills/agent-skill-system-useful-skill.zip",
	},
	"access-control": {
		"ownerId": "00000000-0000-4000-8000-000000000456",
		"constraintExemption": true,
		"preAuthorisedPermissionIds": ["00000000-0000-4000-8000-000000000777"],
	},
}

system_pre_authorised_reader := {
	"id": "00000000-0000-4000-8000-000000000123",
	"permissions": [{
		"id": "00000000-0000-4000-8000-000000000777",
		"resourceUri": "object/agentSkill/system",
		"userOwnershipConstraint": false,
		"orgUnitOwnershipConstraint": false,
		"preAuthorisedConstraint": true,
		"allowExemption": true,
		"operations": [{"uri": "object/agentSkill/system/read"}],
	}],
}

system_publisher(operation) = {
	"id": "00000000-0000-4000-8000-000000000123",
	"permissions": [{
		"id": "00000000-0000-4000-8000-000000000778",
		"resourceUri": "object/agentSkill/system",
		"userOwnershipConstraint": false,
		"orgUnitOwnershipConstraint": false,
		"preAuthorisedConstraint": false,
		"allowExemption": false,
		"operations": [{"uri": sprintf("object/agentSkill/system/%s", [operation])}],
	}],
}

linked_system_object := {
	"bucketName": "magda-datasets",
	"name": "agent-services/skills/system-skills/agent-skill-system-useful-skill.zip",
	"ownerId": "00000000-0000-4000-8000-000000000456",
	"recordId": "agent-skill-system-useful-skill",
	"size": 1024,
	"exists": true,
}

user_skill_owner := "00000000-0000-4000-8000-000000000456"

user_skill_reader := "00000000-0000-4000-8000-000000000123"

user_skill_record_id := "agent-skill-00000000-0000-4000-8000-000000000456-useful-skill"

user_skill_key := "agent-services/skills/user-skills/00000000-0000-4000-8000-000000000456/agent-skill-00000000-0000-4000-8000-000000000456-useful-skill.zip"

user_skill_permission_id := "00000000-0000-4000-8000-000000000779"

user_skill := {
	"id": user_skill_record_id,
	"name": "useful-skill",
	"agent-skill": {
		"name": "useful-skill",
		"type": "user",
		"userId": user_skill_owner,
		"createdBy": user_skill_owner,
		"updatedBy": user_skill_owner,
		"archiveKey": user_skill_key,
	},
	"access-control": {
		"ownerId": user_skill_owner,
		"preAuthorisedPermissionIds": [user_skill_permission_id],
	},
}

linked_user_object := {
	"bucketName": "magda-datasets",
	"name": user_skill_key,
	"ownerId": user_skill_owner,
	"recordId": user_skill_record_id,
	"size": 1024,
	"exists": true,
}

user_owner_reader := {
	"id": user_skill_owner,
	"permissions": [{
		"id": "00000000-0000-4000-8000-000000000780",
		"resourceUri": "object/agentSkill/user",
		"userOwnershipConstraint": true,
		"orgUnitOwnershipConstraint": false,
		"preAuthorisedConstraint": false,
		"allowExemption": false,
		"operations": [{"uri": "object/agentSkill/user/read"}],
	}],
}

user_shared_reader := {
	"id": user_skill_reader,
	"permissions": [{
		"id": user_skill_permission_id,
		"resourceUri": "object/agentSkill/user",
		"userOwnershipConstraint": false,
		"orgUnitOwnershipConstraint": false,
		"preAuthorisedConstraint": true,
		"allowExemption": true,
		"operations": [{"uri": "object/agentSkill/user/read"}],
	}],
}

system_exemption_reader := {
	"id": user_skill_reader,
	"permissions": [{
		"id": "00000000-0000-4000-8000-000000000781",
		"resourceUri": "object/agentSkill/system",
		"userOwnershipConstraint": false,
		"orgUnitOwnershipConstraint": true,
		"preAuthorisedConstraint": false,
		"allowExemption": true,
		"operations": [{"uri": "object/agentSkill/system/read"}],
	}],
	"managingOrgUnitIds": [],
}

test_linked_skill_storage_key_must_match_archive_key {
	mismatched := object.union(linked_system_object, {"name": "other.zip"})
	not allow with input as {
		"operationUri": "storage/object/read",
		"user": system_pre_authorised_reader,
		"storage": {"object": mismatched},
		"object": {"record": system_skill},
	}
}

test_linked_skill_storage_owner_must_match_record_owner {
	mismatched := object.union(linked_system_object, {"ownerId": "00000000-0000-4000-8000-000000000999"})
	not allow with input as {
		"operationUri": "storage/object/upload",
		"user": system_publisher("update"),
		"storage": {"object": mismatched},
		"object": {"record": system_skill},
	}
}

test_linked_storage_read_honours_typed_skill_preauthorisation {
	allow with input as {
		"operationUri": "storage/object/read",
		"user": system_pre_authorised_reader,
		"storage": {"object": linked_system_object},
		"object": {"record": system_skill},
	}
}

test_linked_storage_read_denies_unrelated_typed_permission {
	not allow with input as {
		"operationUri": "storage/object/read",
		"user": object.union(system_pre_authorised_reader, {"permissions": [object.union(system_pre_authorised_reader.permissions[0], {"id": "00000000-0000-4000-8000-000000000999", "allowExemption": false})]}),
		"storage": {"object": linked_system_object},
		"object": {"record": system_skill},
	}
}

test_reserved_skill_read_denies_unconstrained_storage_read {
	reader := storageReader(user_skill_reader, false, false, [])
	not allow with input as {
		"operationUri": "storage/object/read",
		"user": reader,
		"storage": {"object": linked_user_object},
		"object": {"record": user_skill},
	}
}

test_reserved_skill_read_denies_matching_storage_owner_read {
	reader := storageReader(user_skill_owner, true, false, [])
	not allow with input as {
		"operationUri": "storage/object/read",
		"user": reader,
		"storage": {"object": linked_user_object},
		"object": {"record": user_skill},
	}
}

test_reserved_skill_read_denies_matching_storage_org_read {
	reader := storageReader(user_skill_reader, false, true, ["org-1"])
	object_with_org := object.union(linked_user_object, {"orgUnitId": "org-1"})
	not allow with input as {
		"operationUri": "storage/object/read",
		"user": reader,
		"storage": {"object": object_with_org},
		"object": {"record": user_skill},
	}
}

test_reserved_skill_read_denies_storage_org_read_when_org_missing {
	reader := storageReader(user_skill_reader, false, true, ["org-1"])
	not allow with input as {
		"operationUri": "storage/object/read",
		"user": reader,
		"storage": {"object": linked_user_object},
		"object": {"record": user_skill},
	}
}

test_reserved_skill_read_denies_storage_org_read_when_org_empty {
	reader := storageReader(user_skill_reader, false, true, ["org-1"])
	object_with_empty_org := object.union(linked_user_object, {"orgUnitId": ""})
	not allow with input as {
		"operationUri": "storage/object/read",
		"user": reader,
		"storage": {"object": object_with_empty_org},
		"object": {"record": user_skill},
	}
}

test_reserved_skill_read_denies_generic_linked_record_read {
	ordinary_record := {"id": user_skill_record_id, "access-control": {"ownerId": user_skill_owner}}
	generic_record_reader := {
		"id": user_skill_reader,
		"permissions": [{
			"id": "00000000-0000-4000-8000-000000000782",
			"resourceUri": "object/record",
			"userOwnershipConstraint": false,
			"orgUnitOwnershipConstraint": false,
			"preAuthorisedConstraint": false,
			"allowExemption": false,
			"operations": [{"uri": "object/record/read"}],
		}],
	}

	not allow with input as {
		"operationUri": "storage/object/read",
		"user": generic_record_reader,
		"storage": {"object": linked_user_object},
		"object": {"record": ordinary_record},
	}
}

test_user_skill_owner_can_read_reserved_archive {
	allow with input as {
		"operationUri": "storage/object/read",
		"user": user_owner_reader,
		"storage": {"object": linked_user_object},
		"object": {"record": user_skill},
	}
}

test_explicitly_shared_user_can_read_reserved_archive {
	allow with input as {
		"operationUri": "storage/object/read",
		"user": user_shared_reader,
		"storage": {"object": linked_user_object},
		"object": {"record": user_skill},
	}
}

test_public_system_skill_remains_readable_to_exemption_reader {
	allow with input as {
		"operationUri": "storage/object/read",
		"user": system_exemption_reader,
		"storage": {"object": linked_system_object},
		"object": {"record": system_skill},
	}
}

test_reserved_skill_read_requires_existing_object {
	missing := object.union(linked_user_object, {"exists": false})
	not allow with input as {
		"operationUri": "storage/object/read",
		"user": user_owner_reader,
		"storage": {"object": missing},
		"object": {"record": user_skill},
	}
}

test_reserved_skill_read_requires_registry_record {
	reader := storageReader(user_skill_reader, false, false, [])
	not allow with input as {
		"operationUri": "storage/object/read",
		"user": reader,
		"storage": {"object": linked_user_object},
	}
}

test_reserved_skill_read_requires_matching_record_id {
	mismatched := object.union(linked_user_object, {"recordId": "different-record"})
	not allow with input as {
		"operationUri": "storage/object/read",
		"user": user_owner_reader,
		"storage": {"object": mismatched},
		"object": {"record": user_skill},
	}
}

test_reserved_skill_read_requires_matching_archive_key {
	mismatched := object.union(linked_user_object, {"name": "agent-services/skills/user-skills/wrong.zip"})
	not allow with input as {
		"operationUri": "storage/object/read",
		"user": user_owner_reader,
		"storage": {"object": mismatched},
		"object": {"record": user_skill},
	}
}

test_reserved_skill_read_requires_matching_owner {
	mismatched := object.union(linked_user_object, {"ownerId": user_skill_reader})
	not allow with input as {
		"operationUri": "storage/object/read",
		"user": user_owner_reader,
		"storage": {"object": mismatched},
		"object": {"record": user_skill},
	}
}

test_agent_skill_prefix_lookalike_retains_generic_read_semantics {
	reader := storageReader(user_skill_reader, false, false, [])
	allow with input as {
		"operationUri": "storage/object/read",
		"user": reader,
		"storage": {"object": {
			"name": "agent-services/skills/user-skills-lookalike/file.zip",
			"exists": true,
		}},
	}
}

test_legacy_standalone_object_missing_org_remains_readable {
	reader := storageReader(user_skill_reader, false, true, ["org-1"])
	allow with input as {
		"operationUri": "storage/object/read",
		"user": reader,
		"storage": {"object": {"name": "legacy/data.csv", "exists": true}},
	}
}

test_legacy_standalone_object_empty_org_remains_readable {
	reader := storageReader(user_skill_reader, false, true, ["org-1"])
	allow with input as {
		"operationUri": "storage/object/read",
		"user": reader,
		"storage": {"object": {"name": "legacy/data.csv", "orgUnitId": "", "exists": true}},
	}
}

test_legacy_dataset_file_missing_org_remains_readable {
	reader := storageReader(user_skill_reader, false, true, ["org-1"])
	allow with input as {
		"operationUri": "storage/object/read",
		"user": reader,
		"storage": {"object": {
			"name": "datasets/example/distribution.csv",
			"recordId": "distribution-record",
			"exists": true,
		}},
		"object": {"record": {"id": "distribution-record"}},
	}
}

test_reserved_skill_upload_generic_owner_semantics_are_unchanged {
	allow with input as {
		"operationUri": "storage/object/upload",
		"user": ownerConstraintUser(user_skill_owner, "storage/object/upload"),
		"storage": {"object": linked_user_object},
		"object": {"record": user_skill},
	}
}

test_reserved_skill_delete_generic_owner_semantics_are_unchanged {
	allow with input as {
		"operationUri": "storage/object/delete",
		"user": ownerConstraintUser(user_skill_owner, "storage/object/delete"),
		"storage": {"object": linked_user_object},
		"object": {"record": user_skill},
	}
}

test_trusted_non_admin_can_replace_linked_system_archive_without_owning_it {
	allow with input as {
		"operationUri": "storage/object/upload",
		"user": system_publisher("update"),
		"storage": {"object": linked_system_object},
		"object": {"record": system_skill},
	}
}

test_create_only_grant_cannot_replace_existing_linked_archive {
	not allow with input as {
		"operationUri": "storage/object/upload",
		"user": system_publisher("create"),
		"storage": {"object": linked_system_object},
		"object": {"record": system_skill},
	}
}

test_create_only_grant_can_upload_new_linked_archive {
	creator_id := system_publisher("create").id
	new_skill := object.union(system_skill, {
		"agent-skill": object.union(system_skill["agent-skill"], {
			"createdBy": creator_id,
			"updatedBy": creator_id,
		}),
		"access-control": {"ownerId": creator_id},
	})

	new_object := object.union(linked_system_object, {"exists": false, "ownerId": creator_id})
	allow with input as {
		"operationUri": "storage/object/upload",
		"user": system_publisher("create"),
		"storage": {"object": new_object},
		"object": {"record": new_skill},
	}
}

test_create_only_grant_cannot_delete_existing_linked_archive {
	not allow with input as {
		"operationUri": "storage/object/delete",
		"user": system_publisher("create"),
		"storage": {"object": linked_system_object},
		"object": {"record": system_skill},
	}
}

test_update_only_grant_cannot_delete_existing_linked_archive {
	not allow with input as {
		"operationUri": "storage/object/delete",
		"user": system_publisher("update"),
		"storage": {"object": linked_system_object},
		"object": {"record": system_skill},
	}
}

test_delete_grant_can_delete_existing_linked_archive {
	allow with input as {
		"operationUri": "storage/object/delete",
		"user": system_publisher("delete"),
		"storage": {"object": linked_system_object},
		"object": {"record": system_skill},
	}
}

test_unconstrained_generic_record_grant_can_replace_linked_archive {
	allow with input as {
		"operationUri": "storage/object/upload",
		"user": {
			"id": "00000000-0000-4000-8000-000000000999",
			"permissions": [{
				"id": "00000000-0000-4000-8000-000000000790",
				"resourceUri": "object/record",
				"userOwnershipConstraint": false,
				"orgUnitOwnershipConstraint": false,
				"preAuthorisedConstraint": false,
				"allowExemption": false,
				"operations": [{"uri": "object/record/update"}],
			}],
		},
		"storage": {"object": linked_system_object},
		"object": {"record": system_skill},
	}
}

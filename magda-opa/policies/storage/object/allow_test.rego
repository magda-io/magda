package storage.object

ownerConstraintUser(userId, operationUri) = user {
	user := {
		"id": userId,
		"permissions": [{
			"id": "8f6b3c1e-1c4b-4c0e-9d2b-7a3f2f6c9a10",
			"name": "Storage Object Permission with Ownership Constraint",
			"resourceUri": "storage/object",
			"userOwnershipConstraint": true,
			"orgUnitOwnershipConstraint": false,
			"preAuthorisedConstraint": false,
			"allowExemption": false,
			"operations": [{"uri": operationUri}],
		}],
		"managingOrgUnitIds": [],
	}
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
		"archiveKey": "agent-services/skills/system-skills/agent-skill-system-useful-skill.zip",
	},
	"access-control": {
		"ownerId": "00000000-0000-4000-8000-000000000456",
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
		"user": object.union(system_pre_authorised_reader, {"permissions": [object.union(system_pre_authorised_reader.permissions[0], {"id": "00000000-0000-4000-8000-000000000999"})]}),
		"storage": {"object": linked_system_object},
		"object": {"record": system_skill},
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
	new_object := object.union(linked_system_object, {"exists": false})
	allow with input as {
		"operationUri": "storage/object/upload",
		"user": system_publisher("create"),
		"storage": {"object": new_object},
		"object": {"record": system_skill},
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

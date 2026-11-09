package object.record

ag_user_id := "00000000-0000-4000-8000-000000000123"

ag_member_permission_id := "00000000-0000-4000-8000-0000000000b1"

ag_permission(resource_uri, constraints, operations) = p {
	base := {
		"id": "00000000-0000-4000-8000-0000000000c1",
		"resourceUri": resource_uri,
		"userOwnershipConstraint": false,
		"orgUnitOwnershipConstraint": false,
		"preAuthorisedConstraint": false,
		"allowExemption": false,
		"operations": [{"uri": op} | op := operations[_]],
	}
	p := object.union(base, constraints)
}

ag_record_operations := ["object/record/create", "object/record/read", "object/record/update", "object/record/delete"]

ag_owner_record_permission := ag_permission("object/record", {"userOwnershipConstraint": true}, ag_record_operations)

ag_unconstrained_record_permission := ag_permission("object/record", {}, ag_record_operations)

ag_data_steward_dataset_permission := ag_permission(
	"object/dataset/published",
	{"userOwnershipConstraint": true},
	["object/dataset/published/create", "object/dataset/published/read", "object/dataset/published/update"],
)

ag_member_read_permission := ag_permission(
	"object/accessGroup",
	{"id": ag_member_permission_id, "preAuthorisedConstraint": true},
	["object/accessGroup/read"],
)

ag_details := {
	"name": "a group",
	"resourceUri": "object/record",
	"roleId": "00000000-0000-4000-8000-0000000000e1",
	"permissionId": "00000000-0000-4000-8000-0000000000e2",
}

ag_group_record := {
	"id": "00000000-0000-4000-8000-0000000000d1",
	"access-group-details": ag_details,
	"access-control": {"ownerId": ag_user_id, "preAuthorisedPermissionIds": [ag_member_permission_id]},
}

ag_dataset := {
	"id": "ds-1",
	"dcat-dataset-strings": {"title": "a dataset"},
	"publishing": {"state": "published"},
	"access-control": {"ownerId": ag_user_id},
}

ag_dataset_with_group_details := object.union(ag_dataset, {"access-group-details": ag_details})

ag_decide(operation, permissions, record) {
	allow with input as {
		"operationUri": operation,
		"user": {"id": ag_user_id, "managingOrgUnitIds": [], "permissions": permissions},
		"object": {"record": record},
	}
}

test_generic_owner_update_group_record_denied {
	not ag_decide("object/record/update", [ag_owner_record_permission], ag_group_record)
}

test_generic_owner_delete_group_record_denied {
	not ag_decide("object/record/delete", [ag_owner_record_permission], ag_group_record)
}

test_generic_owner_create_group_record_denied {
	not ag_decide("object/record/create", [ag_owner_record_permission], ag_group_record)
}

test_generic_owner_create_dataset_with_group_details_denied {
	not ag_decide("object/record/create", [ag_data_steward_dataset_permission], ag_dataset_with_group_details)
}

test_generic_owner_update_dataset_with_group_details_denied {
	not ag_decide("object/record/update", [ag_data_steward_dataset_permission], ag_dataset_with_group_details)
}

test_unconstrained_record_update_group_record_allowed {
	ag_decide("object/record/update", [ag_unconstrained_record_permission], ag_group_record)
}

test_group_record_read_via_typed_preauth {
	ag_decide("object/record/read", [ag_member_read_permission], ag_group_record)
}

test_group_record_read_via_generic_record_grant_denied {
	not ag_decide("object/record/read", [ag_owner_record_permission], ag_group_record)
}

test_ordinary_dataset_update_unchanged {
	ag_decide("object/record/update", [ag_data_steward_dataset_permission], ag_dataset)
}

test_ordinary_record_owner_update_unchanged {
	ag_decide("object/record/update", [ag_owner_record_permission], {"id": "r-1", "access-control": {"ownerId": ag_user_id}})
}

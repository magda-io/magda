package object.accessGroup

user_id := "00000000-0000-4000-8000-000000000123"

other_id := "00000000-0000-4000-8000-000000000456"

org_unit_id := "00000000-0000-4000-8000-0000000000a1"

member_permission_id := "00000000-0000-4000-8000-0000000000b1"

typed_permission(constraints, operations) = p {
	base := {
		"id": "00000000-0000-4000-8000-0000000000c1",
		"resourceUri": "object/accessGroup",
		"userOwnershipConstraint": false,
		"orgUnitOwnershipConstraint": false,
		"preAuthorisedConstraint": false,
		"allowExemption": false,
		"operations": [{"uri": op} | op := operations[_]],
	}
	p := object.union(base, constraints)
}

all_operations := [
	"object/accessGroup/create",
	"object/accessGroup/read",
	"object/accessGroup/update",
	"object/accessGroup/delete",
]

owner_permission := typed_permission({"userOwnershipConstraint": true}, all_operations)

org_unit_permission := typed_permission({"orgUnitOwnershipConstraint": true}, all_operations)

unconstrained_permission := typed_permission({}, all_operations)

member_read_permission := typed_permission(
	{"id": member_permission_id, "preAuthorisedConstraint": true},
	["object/accessGroup/read"],
)

group_record(owner_id, org_id, pre_auth_ids, resource_uri) = r {
	r := {
		"id": "00000000-0000-4000-8000-0000000000d1",
		"access-group-details": {
			"name": "a group",
			"resourceUri": resource_uri,
			"roleId": "00000000-0000-4000-8000-0000000000e1",
			"permissionId": "00000000-0000-4000-8000-0000000000e2",
		},
		"access-control": {
			"ownerId": owner_id,
			"orgUnitId": org_id,
			"preAuthorisedPermissionIds": pre_auth_ids,
		},
	}
}

own_group := group_record(user_id, null, [], "object/record")

other_group := group_record(other_id, null, [], "object/record")

user(permissions) = u {
	u := {"id": user_id, "managingOrgUnitIds": [org_unit_id], "permissions": permissions}
}

decide(operation, permissions, record) {
	allow with input as {
		"operationUri": operation,
		"user": user(permissions),
		"object": {"accessGroup": record},
	}
}

test_owner_read_own_group {
	decide("object/accessGroup/read", [owner_permission], own_group)
}

test_owner_update_own_group {
	decide("object/accessGroup/update", [owner_permission], own_group)
}

test_owner_delete_own_group {
	decide("object/accessGroup/delete", [owner_permission], own_group)
}

test_owner_update_other_group_denied {
	not decide("object/accessGroup/update", [owner_permission], other_group)
}

test_owner_read_other_group_denied {
	not decide("object/accessGroup/read", [owner_permission], other_group)
}

test_orgunit_read_matching_group {
	decide("object/accessGroup/read", [org_unit_permission], group_record(other_id, org_unit_id, [], "object/record"))
}

test_orgunit_update_matching_group {
	decide("object/accessGroup/update", [org_unit_permission], group_record(other_id, org_unit_id, [], "object/record"))
}

test_orgunit_read_group_without_orgunit_denied {
	not decide("object/accessGroup/read", [org_unit_permission], other_group)
}

test_orgunit_read_group_in_other_orgunit_denied {
	not decide("object/accessGroup/read", [org_unit_permission], group_record(other_id, "00000000-0000-4000-8000-0000000000a2", [], "object/record"))
}

test_preauth_read_member_group {
	decide("object/accessGroup/read", [member_read_permission], group_record(other_id, null, [member_permission_id], "object/record"))
}

test_preauth_read_other_group_denied {
	not decide("object/accessGroup/read", [member_read_permission], other_group)
}

test_preauth_read_does_not_grant_update {
	not decide("object/accessGroup/update", [member_read_permission], group_record(other_id, null, [member_permission_id], "object/record"))
}

test_unconstrained_update_any_group {
	decide("object/accessGroup/update", [unconstrained_permission], other_group)
}

test_unconstrained_delete_any_group {
	decide("object/accessGroup/delete", [unconstrained_permission], other_group)
}

test_skill_share_group_constrained_update_denied {
	not decide("object/accessGroup/update", [owner_permission], group_record(user_id, null, [], "object/agentSkill/user"))
}

test_skill_share_group_constrained_delete_denied {
	not decide("object/accessGroup/delete", [owner_permission], group_record(user_id, null, [], "object/agentSkill/user"))
}

test_skill_share_group_unconstrained_update_allowed {
	decide("object/accessGroup/update", [unconstrained_permission], group_record(other_id, null, [], "object/agentSkill/user"))
}

test_generic_record_grant_does_not_authorise_update {
	generic := {
		"id": "00000000-0000-4000-8000-0000000000c9",
		"resourceUri": "object/record",
		"userOwnershipConstraint": true,
		"orgUnitOwnershipConstraint": false,
		"preAuthorisedConstraint": false,
		"operations": [{"uri": "object/record/update"}],
	}
	not decide("object/accessGroup/update", [generic], own_group)
}

create(permissions, group) {
	allow with input as {
		"operationUri": "object/accessGroup/create",
		"user": user(permissions),
		"accessGroup": group,
	}
}

test_create_owner_constraint_own_group {
	create([owner_permission], {"ownerId": user_id})
}

test_create_owner_constraint_other_owner_denied {
	not create([owner_permission], {"ownerId": other_id})
}

test_create_orgunit_constraint_managed_orgunit {
	create([org_unit_permission], {"ownerId": other_id, "orgUnitId": org_unit_id})
}

test_create_orgunit_constraint_requires_managed_orgunit {
	not create([org_unit_permission], {"ownerId": user_id, "orgUnitId": "00000000-0000-4000-8000-0000000000a2"})
}

test_create_owner_constraint_does_not_allow_by_orgunit {
	not create([owner_permission], {"ownerId": other_id, "orgUnitId": org_unit_id})
}

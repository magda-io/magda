package llm.access

user_id := "00000000-0000-4000-8000-000000000123"

profile_permission_id := "00000000-0000-4000-8000-0000000000aa"

other_permission_id := "00000000-0000-4000-8000-0000000000bb"

finance := "00000000-0000-4000-8000-00000000f000"

corporate := "00000000-0000-4000-8000-00000000c000"

payroll := "00000000-0000-4000-8000-00000000f100"

permission(ops) = p {
	p := {
		"id": "00000000-0000-4000-8000-0000000000cc",
		"resourceUri": "llm/access",
		"userOwnershipConstraint": false,
		"orgUnitOwnershipConstraint": false,
		"preAuthorisedConstraint": false,
		"allowExemption": false,
		"operations": [{"uri": op} | op := ops[_]],
	}
}

invoke_permission := permission(["llm/access/invoke"])

audience_permission := object.union(invoke_permission, {"orgUnitOwnershipConstraint": true})

pre_authorised_permission := object.union(invoke_permission, {"id": profile_permission_id, "preAuthorisedConstraint": true})

profile := {
	"id": "00000000-0000-4000-8000-0000000000dd",
	"org_unit_id": finance,
	"use_permission_id": profile_permission_id,
	"constraint_exemption": false,
}

no_org_unit_profile := object.remove(profile, ["org_unit_id"])

public_profile := object.union(profile, {"constraint_exemption": true})

# A user in `org_unit` (whose ancestors are listed) holding `permissions`.
invoke_input(permissions, ancestor_ids, target) = i {
	i := {
		"operationUri": "llm/access/invoke",
		"user": {
			"id": user_id,
			"roles": [],
			"permissions": permissions,
			"orgUnitAncestorIds": ancestor_ids,
		},
		"object": {"llmAccessProfile": target},
	}
}

management_input(operation, permissions) = i {
	i := {
		"operationUri": operation,
		"user": {"id": user_id, "roles": [], "permissions": permissions, "orgUnitAncestorIds": []},
		"object": {"llmAccessProfile": profile},
	}
}

# --- management: unconstrained only

management_ops := ["llm/access/create", "llm/access/read", "llm/access/update", "llm/access/delete"]

management_permission := permission(management_ops)

constrained_management_permissions := [
	object.union(management_permission, {"userOwnershipConstraint": true}),
	object.union(management_permission, {"orgUnitOwnershipConstraint": true}),
	object.union(management_permission, {"preAuthorisedConstraint": true, "id": profile_permission_id}),
	object.union(management_permission, {"orgUnitOwnershipConstraint": true, "allowExemption": true}),
]

test_allow_unconstrained_create {
	allow with input as management_input("llm/access/create", [management_permission])
}

test_allow_unconstrained_read {
	allow with input as management_input("llm/access/read", [management_permission])
}

test_allow_unconstrained_update {
	allow with input as management_input("llm/access/update", [management_permission])
}

test_allow_unconstrained_delete {
	allow with input as management_input("llm/access/delete", [management_permission])
}

test_deny_constrained_create {
	not allow with input as management_input("llm/access/create", constrained_management_permissions)
}

test_deny_constrained_read {
	not allow with input as management_input("llm/access/read", constrained_management_permissions)
}

test_deny_constrained_update {
	not allow with input as management_input("llm/access/update", constrained_management_permissions)
}

test_deny_constrained_delete {
	not allow with input as management_input("llm/access/delete", constrained_management_permissions)
}

test_deny_management_with_exemption_on_public_profile {
	not allow with input as object.union(
		management_input("llm/access/update", [object.union(permission(["llm/access/update"]), {"orgUnitOwnershipConstraint": true, "allowExemption": true})]),
		{"object": {"llmAccessProfile": public_profile}},
	)
}

test_deny_management_with_invoke_permission {
	not allow with input as management_input("llm/access/update", [invoke_permission])
}

# --- invoke 1: unconstrained

test_allow_unconstrained_invoke {
	allow with input as invoke_input([invoke_permission], [], no_org_unit_profile)
}

test_deny_unconstrained_permission_on_other_resource {
	not allow with input as invoke_input([object.union(invoke_permission, {"resourceUri": "llm/usage"})], [], profile)
}

test_deny_unconstrained_permission_for_other_operation {
	not allow with input as invoke_input([permission(["llm/access/read"])], [], profile)
}

# --- invoke 2: audience org unit

test_allow_audience_own_org_unit {
	allow with input as invoke_input([audience_permission], [finance, corporate], profile)
}

test_allow_audience_profile_on_ancestor_org_unit {
	# user in Finance › Payroll; profile on Finance
	allow with input as invoke_input([audience_permission], [payroll, finance, corporate], profile)
}

test_deny_audience_profile_on_descendant_org_unit {
	# user in Corporate; profile on Finance (below Corporate)
	not allow with input as invoke_input([audience_permission], [corporate], profile)
}

sibling := "00000000-0000-4000-8000-00000000e000"

test_deny_audience_profile_on_sibling_org_unit {
	not allow with input as invoke_input([audience_permission], [sibling, corporate], profile)
}

test_deny_audience_profile_without_org_unit {
	not allow with input as invoke_input([audience_permission], [finance, corporate], no_org_unit_profile)
}

test_deny_audience_user_without_org_unit {
	not allow with input as invoke_input([audience_permission], [], profile)
}

# --- invoke 3: the profile's own pre-authorised permission

test_allow_profile_pre_authorised_permission {
	allow with input as invoke_input([pre_authorised_permission], [], no_org_unit_profile)
}

test_deny_other_pre_authorised_permission {
	not allow with input as invoke_input([object.union(pre_authorised_permission, {"id": other_permission_id})], [], profile)
}

test_deny_pre_authorised_id_from_one_permission_flags_from_another {
	# The profile's ID is on a read permission; the invoke permission has another ID.
	not allow with input as invoke_input(
		[
			object.union(pre_authorised_permission, {"operations": [{"uri": "llm/access/read"}]}),
			object.union(pre_authorised_permission, {"id": other_permission_id}),
		],
		[],
		profile,
	)
}

test_deny_profile_permission_id_without_pre_authorised_flag {
	not allow with input as invoke_input(
		[object.union(pre_authorised_permission, {"preAuthorisedConstraint": false, "userOwnershipConstraint": true})],
		[],
		profile,
	)
}

# --- invoke 4: public profile with exemption

test_allow_public_profile_with_exemption {
	allow with input as invoke_input([object.union(audience_permission, {"allowExemption": true})], [], object.remove(public_profile, ["org_unit_id"]))
}

test_deny_public_profile_without_exemption {
	not allow with input as invoke_input([audience_permission], [], object.remove(public_profile, ["org_unit_id"]))
}

test_deny_exemption_on_non_public_profile {
	not allow with input as invoke_input([object.union(audience_permission, {"allowExemption": true})], [corporate], profile)
}

# --- owner constraint and callers

test_deny_owner_constrained_invoke {
	not allow with input as invoke_input(
		[
			object.union(invoke_permission, {"userOwnershipConstraint": true}),
			object.union(invoke_permission, {"userOwnershipConstraint": true, "orgUnitOwnershipConstraint": true}),
		],
		[finance],
		profile,
	)
}

test_deny_anonymous_invoke {
	not allow with input as object.union(invoke_input([invoke_permission], [], profile), {"user": {"id": ""}})
}

test_deny_missing_user_id {
	not allow with input as {
		"operationUri": "llm/access/invoke",
		"user": {"roles": [], "permissions": [invoke_permission]},
		"object": {"llmAccessProfile": profile},
	}
}

test_deny_unknown_operation {
	not allow with input as object.union(invoke_input([permission(["llm/access/admin"])], [], profile), {"operationUri": "llm/access/admin"})
}

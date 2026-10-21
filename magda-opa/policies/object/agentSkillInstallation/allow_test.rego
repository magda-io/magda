package object.agentSkillInstallation

recipient := "00000000-0000-4000-8000-0000000000b0"

publisher := "00000000-0000-4000-8000-0000000000a1"

other := "00000000-0000-4000-8000-0000000000c3"

install_permission(owner) = {
	"id": "00000000-3854-4100-8000-000000000006",
	"resourceUri": "object/agentSkill/install",
	"userOwnershipConstraint": owner,
	"orgUnitOwnershipConstraint": false,
	"preAuthorisedConstraint": false,
	"allowExemption": false,
	"operations": [
		{"uri": "object/agentSkill/install/create"},
		{"uri": "object/agentSkill/install/read"},
		{"uri": "object/agentSkill/install/update"},
		{"uri": "object/agentSkill/install/delete"},
	],
}

installation(user, source, alias) = record {
	effective := name_for(alias)
	record := {
		"id": sprintf("agent-skill-%s-%s", [user, effective]),
		"name": effective,
		"agent-skill-installation": with_alias(
			{
				"userId": user,
				"sourceSkillId": sprintf("agent-skill-%s-csv-reporter", [source]),
				"createdAt": "2026-10-21T00:00:00Z",
			},
			alias,
		),
		"access-control": {"ownerId": user},
	}
}

name_for(alias) = alias {
	alias != ""
}

name_for(alias) = "csv-reporter" {
	alias == ""
}

with_alias(value, alias) = object.union(value, {"alias": alias}) {
	alias != ""
}

with_alias(value, alias) = value {
	alias == ""
}

decide(operation, record, permissions) {
	allow with input as {
		"operationUri": sprintf("object/agentSkill/install/%s", [operation]),
		"object": {"agentSkillInstallation": record},
		"user": {"id": recipient, "permissions": permissions},
	}
}

test_recipient_installs_under_source_name {
	decide("create", installation(recipient, publisher, ""), [install_permission(true)])
}

test_recipient_installs_under_alias {
	decide("create", installation(recipient, publisher, "team-csv"), [install_permission(true)])
}

test_alias_equal_to_source_name_is_not_an_alias {
	not decide("create", installation(recipient, publisher, "csv-reporter"), [install_permission(true)])
}

test_cannot_install_for_another_recipient {
	not decide("create", installation(other, publisher, ""), [install_permission(true)])
}

test_cannot_install_own_publication {
	not decide("create", installation(recipient, recipient, ""), [install_permission(true)])
}

test_record_id_must_match_effective_name {
	record := installation(recipient, publisher, "team-csv")
	not decide("create", object.union(record, {"id": sprintf("agent-skill-%s-csv-reporter", [recipient])}), [install_permission(true)])
}

test_record_name_must_match_effective_name {
	record := installation(recipient, publisher, "team-csv")
	not decide("create", object.union(record, {"name": "csv-reporter"}), [install_permission(true)])
}

test_owner_must_be_recipient {
	record := installation(recipient, publisher, "")
	not decide("create", object.union(record, {"access-control": {"ownerId": other}}), [install_permission(true)])
}

test_system_prefixed_alias_is_rejected {
	not decide("create", installation(recipient, publisher, "system-csv"), [install_permission(true)])
}

test_runtime_bundled_alias_is_rejected {
	not decide("create", installation(recipient, publisher, "magda-mgd"), [install_permission(true)])
}

test_overlong_alias_is_rejected {
	not decide("create", installation(recipient, publisher, "a23456789-123456789-123456789-123456789-1234567"), [install_permission(true)])
}

test_system_source_is_rejected {
	record := installation(recipient, publisher, "")
	not decide(
		"create", object.union(record, {"agent-skill-installation": {
			"userId": recipient,
			"sourceSkillId": "agent-skill-system-csv-reporter",
			"createdAt": "2026-10-21T00:00:00Z",
		}}),
		[install_permission(true)],
	)
}

test_record_with_publication_marker_is_not_an_installation {
	record := installation(recipient, publisher, "")
	not decide("create", object.union(record, {"agent-skill": {"type": "user", "userId": recipient}}), [install_permission(true)])
	not decide("delete", object.union(record, {"agent-skill": {"type": "user", "userId": recipient}}), [install_permission(true)])
}

test_recipient_reads_own_installation_only {
	decide("read", installation(recipient, publisher, ""), [install_permission(true)])
	not decide("read", installation(other, publisher, ""), [install_permission(true)])
}

test_owner_update_is_never_granted {
	not decide("update", installation(recipient, publisher, ""), [install_permission(true)])
}

test_unconstrained_update_keeps_identity {
	decide("update", installation(recipient, publisher, ""), [install_permission(false)])
	record := installation(recipient, publisher, "")
	not decide("update", object.union(record, {"id": "agent-skill-other"}), [install_permission(false)])
}

test_recipient_deletes_own_installation {
	decide("delete", installation(recipient, publisher, ""), [install_permission(true)])
	not decide("delete", installation(other, publisher, ""), [install_permission(true)])
}

test_recipient_deletes_own_malformed_installation {
	record := installation(recipient, publisher, "")
	decide(
		"delete", object.union(record, {"agent-skill-installation": {
			"userId": recipient,
			"sourceSkillId": "not-a-skill",
		}}),
		[install_permission(true)],
	)
}

test_cannot_delete_installation_outside_own_namespace {
	record := installation(recipient, publisher, "")
	not decide("delete", object.union(record, {"id": sprintf("agent-skill-%s-csv-reporter", [other])}), [install_permission(true)])
}

test_no_permission_denies_everything {
	not decide("create", installation(recipient, publisher, ""), [])
	not decide("read", installation(recipient, publisher, ""), [])
	not decide("delete", installation(recipient, publisher, ""), [])
}

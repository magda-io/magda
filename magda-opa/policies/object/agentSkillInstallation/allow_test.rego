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

test_cannot_install_for_another_recipient {
	not decide("create", installation(other, publisher, ""), [install_permission(true)])
}

test_owner_must_be_recipient {
	record := installation(recipient, publisher, "")
	not decide("create", object.union(record, {"access-control": {"ownerId": other}}), [install_permission(true)])
}

# Identity (record ID, names, alias and source ID) is data validation, done by
# Agent Services before every write and for every record it returns. The policy
# only authorises: it checks the caller's ownership with literal comparisons.
test_identity_is_not_validated_by_the_policy {
	record := installation(recipient, publisher, "team-csv")
	decide("create", object.union(record, {"id": sprintf("agent-skill-%s-csv-reporter", [recipient])}), [install_permission(true)])
	decide("create", object.union(record, {"name": "csv-reporter"}), [install_permission(true)])
	decide("create", installation(recipient, publisher, "system-csv"), [install_permission(true)])
	decide("create", installation(recipient, recipient, ""), [install_permission(true)])
	decide("delete", object.union(record, {"id": sprintf("agent-skill-%s-csv-reporter", [other])}), [install_permission(true)])
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

test_unconstrained_grant_manages_any_installation {
	decide("read", installation(other, publisher, ""), [install_permission(false)])
	decide("create", installation(other, publisher, ""), [install_permission(false)])
	decide("update", installation(other, publisher, ""), [install_permission(false)])
	decide("delete", installation(other, publisher, ""), [install_permission(false)])
	record := installation(other, publisher, "")
	not decide("update", object.union(record, {"agent-skill": {"type": "user", "userId": other}}), [install_permission(false)])
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

test_no_permission_denies_everything {
	not decide("create", installation(recipient, publisher, ""), [])
	not decide("read", installation(recipient, publisher, ""), [])
	not decide("delete", installation(recipient, publisher, ""), [])
}

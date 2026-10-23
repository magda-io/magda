package object.record

import data.common.breakdownOperationUri
import data.common.hasNoConstraintPermission
import data.common.isDraftDataset
import data.common.isDraftDistribution
import data.common.isPublishedDataset
import data.common.isPublishedDistribution
import data.common.verifyRecordPermission
import data.object.agentSkill.verifyPermission as verifyAgentSkillPermission
import data.object.dataset.verifyPermission as verifyDatasetPermission
import data.object.distribution.verifyPermission as verifyDistributionPermission
import data.object.organization.verifyPermission as verifyOrgPermission

default allow = false

allow {
	verifyPermission(input.operationUri)
}

# Unconstrained generic record grants (no ownership, org unit or pre-authorised
# constraint) are deliberate grants to trusted users (no built-in role has one).
# They apply to every record, including typed Agent Skill records.
verifyPermission(operationUri) {
	hasNoConstraintPermission(operationUri)
}

# Agent Skill records are read with the typed Agent Skill read rules.
# They're written by Agent Services only (with its internal admin session),
# after it authorises the caller with the typed Agent Skill operations. So
# there are no typed write rules here: generic writes on Agent Skill records
# are limited to admins and unconstrained grants above.
verifyPermission(operationUri) {
	input.object.record["agent-skill"].type == "system"

	[resourceType, operationType, resourceUriPrefix] := breakdownOperationUri(operationUri)
	operationType == "read"
	verifyAgentSkillPermission("object/agentSkill/system/read", "record")
}

verifyPermission(operationUri) {
	input.object.record["agent-skill"].type == "user"

	[resourceType, operationType, resourceUriPrefix] := breakdownOperationUri(operationUri)
	operationType == "read"
	verifyAgentSkillPermission("object/agentSkill/user/read", "record")
}

# A concrete typed publication never falls back to constrained generic
# object/record grants. #3861 will replace the fail-closed installation
# reservation with typed installation dispatch after its aspect and lifecycle exist.
verifyPermission(operationUri) {
	not input.object.record["agent-skill"]
	not input.object.record["agent-skill-installation"]
	verifyNonAgentSkillPermission(operationUri)
}

# delegated to published dataset rules
verifyNonAgentSkillPermission(operationUri) {
	isPublishedDataset("record")

	[resourceType, operationType, resourceUriPrefix] := breakdownOperationUri(operationUri)
	inputOperationUri := concat("/", ["object", "dataset", "published", operationType])
	verifyDatasetPermission(inputOperationUri, "record")
}

# delegated to draft dataset rules
verifyNonAgentSkillPermission(operationUri) {
	isDraftDataset("record")

	[resourceType, operationType, resourceUriPrefix] := breakdownOperationUri(operationUri)
	inputOperationUri := concat("/", ["object", "dataset", "draft", operationType])
	verifyDatasetPermission(inputOperationUri, "record")
}

# delegated to rules for other dataset type (reserved for future)
verifyNonAgentSkillPermission(operationUri) {
	input.object.record["dcat-dataset-strings"]
	not isDraftDataset("record")
	not isPublishedDataset("record")
	input.object.record.publishing.state

	[resourceType, operationType, resourceUriPrefix] := breakdownOperationUri(operationUri)
	inputOperationUri := concat("/", ["object", "dataset", "*", operationType])
	verifyDatasetPermission(inputOperationUri, "record")
}

# delegated to published distribution rules
verifyNonAgentSkillPermission(operationUri) {
	isPublishedDistribution("record")

	[resourceType, operationType, resourceUriPrefix] := breakdownOperationUri(operationUri)
	inputOperationUri := concat("/", ["object", "distribution", "published", operationType])
	verifyDistributionPermission(inputOperationUri, "record")
}

# delegated to draft distribution rules
verifyNonAgentSkillPermission(operationUri) {
	isDraftDistribution("record")

	[resourceType, operationType, resourceUriPrefix] := breakdownOperationUri(operationUri)
	inputOperationUri := concat("/", ["object", "distribution", "draft", operationType])
	verifyDistributionPermission(inputOperationUri, "record")
}

# delegated to rules for other distribution type (reserved for future)
verifyNonAgentSkillPermission(operationUri) {
	input.object.record["dcat-distribution-strings"]
	not isDraftDistribution("record")
	not isPublishedDistribution("record")
	input.object.record.publishing.state

	[resourceType, operationType, resourceUriPrefix] := breakdownOperationUri(operationUri)
	inputOperationUri := concat("/", ["object", "distribution", "*", operationType])
	verifyDistributionPermission(inputOperationUri, "record")
}

verifyNonAgentSkillPermission(operationUri) {
	input.object.record["organization-details"]

	[resourceType, operationType, resourceUriPrefix] := breakdownOperationUri(operationUri)
	inputOperationUri := concat("/", ["object", "organization", operationType])
	verifyOrgPermission(inputOperationUri, "record")
}

# Handle all remaining non-skill record types with general access-control rules.
verifyNonAgentSkillPermission(operationUri) {
	verifyRecordPermission(operationUri, "record")
}

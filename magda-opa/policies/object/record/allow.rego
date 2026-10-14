package object.record

import data.common.breakdownOperationUri
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

originalAgentSkillStateAllowed("read") = true

originalAgentSkillStateAllowed(operationType) {
	operationType != "read"
	not input.object.originalRecord["agent-skill"]
}

originalAgentSkillStateAllowed(operationType) {
	operationType != "read"
	input.object.originalRecord["agent-skill"].type == "system"
	inputOperationUri := concat("/", ["object", "agentSkill", "system", operationType])
	verifyAgentSkillPermission(inputOperationUri, "originalRecord")
}

originalAgentSkillStateAllowed(operationType) {
	operationType != "read"
	input.object.originalRecord["agent-skill"].type == "user"
	inputOperationUri := concat("/", ["object", "agentSkill", "user", operationType])
	verifyAgentSkillPermission(inputOperationUri, "originalRecord")
}

# Agent Skill dispatch is exclusive. Proposed Registry mutation contexts include
# originalRecord, so type switching requires permission for both old and new
# typed states without reserving otherwise-generic record IDs.
verifyPermission(operationUri) {
	input.object.record["agent-skill"].type == "system"

	[resourceType, operationType, resourceUriPrefix] := breakdownOperationUri(operationUri)
	inputOperationUri := concat("/", ["object", "agentSkill", "system", operationType])
	verifyAgentSkillPermission(inputOperationUri, "record")
	originalAgentSkillStateAllowed(operationType)
}

verifyPermission(operationUri) {
	input.object.record["agent-skill"].type == "user"

	[resourceType, operationType, resourceUriPrefix] := breakdownOperationUri(operationUri)
	inputOperationUri := concat("/", ["object", "agentSkill", "user", operationType])
	verifyAgentSkillPermission(inputOperationUri, "record")
	originalAgentSkillStateAllowed(operationType)
}

# A mutation that presents a non-skill proposed state may not remove the marker
# from an existing Agent Skill and fall back to generic object/record grants.
verifyPermission(operationUri) {
	not input.object.record["agent-skill"]
	not input.object.originalRecord["agent-skill"]

	# #3861 will replace this fail-closed reservation with typed installation
	# dispatch after its aspect and lifecycle exist.
	not input.object.record["agent-skill-installation"]
	not input.object.originalRecord["agent-skill-installation"]
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

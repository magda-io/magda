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

originalAgentSkillStateAllowed("read", publicationType) = true

originalAgentSkillStateAllowed(operationType, publicationType) {
	operationType != "read"
	not input.object.originalRecord["agent-skill"]
}

sameOptionalAgentSkillUserId {
	not input.object.originalRecord["agent-skill"].userId
	not input.object.record["agent-skill"].userId
}

sameOptionalAgentSkillUserId {
	input.object.originalRecord["agent-skill"].userId == input.object.record["agent-skill"].userId
}

immutableAgentSkillFields {
	input.object.originalRecord.id == input.object.record.id
	input.object.originalRecord.name == input.object.record.name
	input.object.originalRecord["agent-skill"].name == input.object.record["agent-skill"].name
	input.object.originalRecord["agent-skill"].type == input.object.record["agent-skill"].type
	sameOptionalAgentSkillUserId
	input.object.originalRecord["agent-skill"].createdAt == input.object.record["agent-skill"].createdAt
	input.object.originalRecord["agent-skill"].createdBy == input.object.record["agent-skill"].createdBy
	input.object.originalRecord["agent-skill"].archiveKey == input.object.record["agent-skill"].archiveKey
	input.object.originalRecord["access-control"].ownerId == input.object.record["access-control"].ownerId
}

originalAgentSkillStateAllowed(operationType, publicationType) {
	operationType != "read"
	input.object.originalRecord["agent-skill"].type == publicationType
	immutableAgentSkillFields
	inputOperationUri := concat("/", ["object", "agentSkill", publicationType, operationType])
	verifyAgentSkillPermission(inputOperationUri, "originalRecord")
}

# Agent Skill dispatch is exclusive. Proposed Registry mutation contexts include
# originalRecord, so immutable publication identity (including type) is
# preserved while both old and proposed same-type states are authorized.
verifyPermission(operationUri) {
	input.object.record["agent-skill"].type == "system"

	[resourceType, operationType, resourceUriPrefix] := breakdownOperationUri(operationUri)
	inputOperationUri := concat("/", ["object", "agentSkill", "system", operationType])
	verifyAgentSkillPermission(inputOperationUri, "record")
	originalAgentSkillStateAllowed(operationType, "system")
}

verifyPermission(operationUri) {
	input.object.record["agent-skill"].type == "user"

	[resourceType, operationType, resourceUriPrefix] := breakdownOperationUri(operationUri)
	inputOperationUri := concat("/", ["object", "agentSkill", "user", operationType])
	verifyAgentSkillPermission(inputOperationUri, "record")
	originalAgentSkillStateAllowed(operationType, "user")
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

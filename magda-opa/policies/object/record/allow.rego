package object.record

import data.common.breakdownOperationUri
import data.common.isDraftDataset
import data.common.isDraftDistribution
import data.common.isPublishedDataset
import data.common.isPublishedDistribution
import data.common.verifyRecordPermission
import data.object.agentSkill.verifyPermission as verifyAgentSkillPermission
import data.object.agentSkillInstallation.verifyPermission as verifyAgentSkillInstallationPermission
import data.object.dataset.verifyPermission as verifyDatasetPermission
import data.object.distribution.verifyPermission as verifyDistributionPermission
import data.object.organization.verifyPermission as verifyOrgPermission

default allow = false

allow {
	verifyPermission(input.operationUri)
}

# Agent Skill dispatch is exclusive for every concrete current or proposed
# record supplied by Registry. Cross-version business invariants are enforced by
# the supported Agent Services lifecycle; generic Registry mutation hardening is
# intentionally tracked separately in #3862/#3863.
verifyPermission(operationUri) {
	input.object.record["agent-skill"].type == "system"
	not input.object.record["agent-skill-installation"]

	[resourceType, operationType, resourceUriPrefix] := breakdownOperationUri(operationUri)
	inputOperationUri := concat("/", ["object", "agentSkill", "system", operationType])
	verifyAgentSkillPermission(inputOperationUri, "record")
}

verifyPermission(operationUri) {
	input.object.record["agent-skill"].type == "user"
	not input.object.record["agent-skill-installation"]

	[resourceType, operationType, resourceUriPrefix] := breakdownOperationUri(operationUri)
	inputOperationUri := concat("/", ["object", "agentSkill", "user", operationType])
	verifyAgentSkillPermission(inputOperationUri, "record")
}

# A recipient installation record (#3861) uses only typed installation
# operations. It never authorizes its source publication, and a record carrying
# both markers matches neither typed path, so it fails closed.
verifyPermission(operationUri) {
	input.object.record["agent-skill-installation"]
	not input.object.record["agent-skill"]

	[resourceType, operationType, resourceUriPrefix] := breakdownOperationUri(operationUri)
	inputOperationUri := concat("/", ["object", "agentSkill", "install", operationType])
	verifyAgentSkillInstallationPermission(inputOperationUri, "record")
}

# Concrete typed publications and installations never fall back to generic
# object/record grants.
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

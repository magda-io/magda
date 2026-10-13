package object.record

import data.common.breakdownOperationUri
import data.common.verifyRecordPermission
import data.common.isPublishedDataset
import data.common.isDraftDataset
import data.common.isPublishedDistribution
import data.common.isDraftDistribution
import data.object.dataset.verifyPermission as verifyDatasetPermission
import data.object.organization.verifyPermission as verifyOrgPermission
import data.object.distribution.verifyPermission as verifyDistributionPermission
import data.object.agentSkill.verifyPermission as verifyAgentSkillPermission

default allow = false

allow {
    verifyPermission(input.operationUri)
}

# Agent Skill dispatch is exclusive. A record cannot escape it by also carrying
# a dataset, distribution, organization, or other generic marker aspect.
verifyPermission(operationUri) {
    input.object.record["agent-skill"]

    [resourceType, operationType, resourceUriPrefix] := breakdownOperationUri(operationUri)
    inputOperationUri := concat("/", ["object", "agentSkill", operationType])
    verifyAgentSkillPermission(inputOperationUri, "record")
}

# Post-update decisions carry originalRecord. If the original was an Agent Skill
# but the proposed record is not, fail closed so non-admin callers cannot strip
# the protected type aspect and fall through to generic record permissions.
verifyPermission(operationUri) {
    not input.object.record["agent-skill"]
    not input.object.originalRecord["agent-skill"]
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

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

default allow = false

allow {
    verifyPermission(input.operationUri)
}

# delegated to published dataset rules
verifyPermission(operationUri) {
    isPublishedDataset("record")

    [resourceType, operationType, resourceUriPrefix] := breakdownOperationUri(operationUri)
    inputOperationUri := concat("/", ["object", "dataset", "published", operationType])
    # proxy to dataset related permission decision
    verifyDatasetPermission(inputOperationUri, "record")
}

# delegated to draft dataset rules
verifyPermission(operationUri) {
    isDraftDataset("record")

    [resourceType, operationType, resourceUriPrefix] := breakdownOperationUri(operationUri)
    inputOperationUri := concat("/", ["object", "dataset", "draft", operationType])
    # proxy to dataset related permission decision
    verifyDatasetPermission(inputOperationUri, "record")
}

# delegated to rules for other dataset type (reserved for future)
verifyPermission(operationUri) {
    input.object.record["dcat-dataset-strings"]
    not isDraftDataset("record")
    not isPublishedDataset("record")
    input.object.record.publishing.state

    [resourceType, operationType, resourceUriPrefix] := breakdownOperationUri(operationUri)
    inputOperationUri := concat("/", ["object", "dataset", "*", operationType])
    # proxy to dataset related permission decision
    verifyDatasetPermission(inputOperationUri, "record")
}

# delegated to published distribution rules
verifyPermission(operationUri) {
    isPublishedDistribution("record")

    [resourceType, operationType, resourceUriPrefix] := breakdownOperationUri(operationUri)
    inputOperationUri := concat("/", ["object", "distribution", "published", operationType])
    # proxy to distribution related permission decision
    verifyDistributionPermission(inputOperationUri, "record")
}

# delegated to draft distribution rules
verifyPermission(operationUri) {
    isDraftDistribution("record")

    [resourceType, operationType, resourceUriPrefix] := breakdownOperationUri(operationUri)
    inputOperationUri := concat("/", ["object", "distribution", "draft", operationType])
    # proxy to distribution related permission decision
    verifyDistributionPermission(inputOperationUri, "record")
}

# delegated to rules for other distribution type (reserved for future)
verifyPermission(operationUri) {
    input.object.record["dcat-distribution-strings"]
    not isDraftDistribution("record")
    not isPublishedDistribution("record")
    input.object.record.publishing.state

    [resourceType, operationType, resourceUriPrefix] := breakdownOperationUri(operationUri)
    inputOperationUri := concat("/", ["object", "distribution", "*", operationType])
    # proxy to distribution related permission decision
    verifyDistributionPermission(inputOperationUri, "record")
}

verifyPermission(operationUri) {
    # organization-details' existence proves it's a organization record
    input.object.record["organization-details"]

    [resourceType, operationType, resourceUriPrefix] := breakdownOperationUri(operationUri)
    inputOperationUri := concat("/", ["object", "organization", operationType])
    # proxy to organization related permission decision
    verifyOrgPermission(inputOperationUri, "record")
}

# handle all other not specified record types with general access control rules
verifyPermission(operationUri) {
    verifyRecordPermission(operationUri, "record")
}

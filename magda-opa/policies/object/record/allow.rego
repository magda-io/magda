package object.record

import data.common.breakdownOperationUri
import data.common.verifyRecordPermission
import data.object.dataset.verifyPermission as verifyDatasetPermission
import data.object.organization.verifyPermission as verifyOrgPermission
import data.object.distribution.verifyPermission as verifyDistributionPermission

default allow = false

allow {
    verifyPermission(input.operationUri)
}

isPublishedDataset {
    input.object.record["dcat-dataset-strings"]
    input.object.record.publishing.state = "published"
}

# a publish dataset record might only contains `dcat-dataset-strings` aspect (but not contain `dataset-draft` aspect)
isPublishedDataset {
    input.object.record["dcat-dataset-strings"]
    not input.object.record["dataset-draft"]
    not input.object.record.publishing.state
}

# delegated to published dataset rules
verifyPermission(operationUri) {
    isPublishedDataset

    [resourceType, operationType, resourceUriPrefix] := breakdownOperationUri(operationUri)
    inputOperationUri := concat("/", ["object", "dataset", "published", operationType])
    # proxy to dataset related permission decision
    verifyDatasetPermission(inputOperationUri, "record")
}

# a record can with publishing.state = "draft" must be a draft dataset
# input.object.record["dataset-draft"] could not exist
isDraftDataset {
    input.object.record.publishing.state = "draft"
}

# a draft dataset record might only contains `dataset-draft` aspect
isDraftDataset {
    input.object.record["dataset-draft"]
    not input.object.record.publishing.state
}

# delegated to draft dataset rules
verifyPermission(operationUri) {
    isDraftDataset

    [resourceType, operationType, resourceUriPrefix] := breakdownOperationUri(operationUri)
    inputOperationUri := concat("/", ["object", "dataset", "draft", operationType])
    # proxy to dataset related permission decision
    verifyDatasetPermission(inputOperationUri, "record")
}

# delegated to rules for other dataset type (reserved for future)
verifyPermission(operationUri) {
    input.object.record["dcat-dataset-strings"]
    not isDraftDataset
    not isPublishedDataset
    input.object.record.publishing.state

    [resourceType, operationType, resourceUriPrefix] := breakdownOperationUri(operationUri)
    inputOperationUri := concat("/", ["object", "dataset", "*", operationType])
    # proxy to dataset related permission decision
    verifyDatasetPermission(inputOperationUri, "record")
}


verifyPermission(operationUri) {
    # organization-details' existence proves it's a organization record
    input.object.record["organization-details"]

    [resourceType, operationType, resourceUriPrefix] := breakdownOperationUri(operationUri)
    inputOperationUri := concat("/", ["object", "organization", operationType])
    # proxy to organization related permission decision
    verifyOrgPermission(inputOperationUri, "record")
}

verifyPermission(operationUri) {
    # dcat-distribution-strings' existence proves it's a distribution record
    input.object.record["dcat-distribution-strings"]

    [resourceType, operationType, resourceUriPrefix] := breakdownOperationUri(operationUri)
    inputOperationUri := concat("/", ["object", "distribution", operationType])
    # proxy to distribution related permission decision
    verifyDistributionPermission(inputOperationUri, "record")
}

# handle all other not specified record types with general access control rules
verifyPermission(operationUri) {
    verifyRecordPermission(operationUri, "record")
}

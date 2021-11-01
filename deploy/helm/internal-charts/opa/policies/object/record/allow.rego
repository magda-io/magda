package object.record

import data.common.breakdownOperationUri
import data.common.verifyRecordPermission
import data.object.dataset.verifyPermission as verifyDatasetPermission
import data.object.organization.verifyPermission as verifyOrgPermission
import data.object.distribution.verifyPermission as verifyDistributionPermission

default allow = false

allow {
    # dcat-dataset-strings' existence proves it's a dataset record
    input.object.record["dcat-dataset-strings"]

    [resourceType, operationType, resourceUriPrefix] := breakdownOperationUri(input.operationUri)
    inputOperationUri := concat("/", ["object", "dataset", "*", operationType])
    # proxy to dataset related permission decision
    verifyDatasetPermission(inputOperationUri, "record")
}

allow {
    # a draft dataset record might only contains `dataset-draft` aspect
    input.object.record["dataset-draft"]

    [resourceType, operationType, resourceUriPrefix] := breakdownOperationUri(input.operationUri)
    inputOperationUri := concat("/", ["object", "dataset", "*", operationType])
    # proxy to dataset related permission decision
    verifyDatasetPermission(inputOperationUri, "record")
}

allow {
    # organization-details' existence proves it's a organization record
    input.object.record["organization-details"]

    [resourceType, operationType, resourceUriPrefix] := breakdownOperationUri(input.operationUri)
    inputOperationUri := concat("/", ["object", "organization", operationType])
    # proxy to organization related permission decision
    verifyOrgPermission(inputOperationUri, "record")
}

allow {
    # dcat-distribution-strings' existence proves it's a distribution record
    input.object.record["dcat-distribution-strings"]

    [resourceType, operationType, resourceUriPrefix] := breakdownOperationUri(input.operationUri)
    inputOperationUri := concat("/", ["object", "distribution", operationType])
    # proxy to distribution related permission decision
    verifyDistributionPermission(inputOperationUri, "record")
}

# handle all other not specified record types with general access control rules
allow {
    verifyRecordPermission(input.operationUri, "record")
}

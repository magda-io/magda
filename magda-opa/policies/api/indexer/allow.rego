package api.indexer

import data.common.hasNoConstraintPermission

default allow = false

# User has a permission to perfom operation with no constaint 
# only support the following external facing APIs: `api/indexer/reindex` & `api/indexer/reindex/in-progress`
# 
allow {
    hasNoConstraintPermission(input.operationUri)
}
package entrypoint

import data.object.dataset.allow as dataset_allow
import data.object.content.allowRead as content_allowRead

# When no rule match, the decision will be `denied` 
default allow = false

allow {
     ## delegate dataset related decision to dataset_allow
    startswith(input.operationUri, "object/dataset/")
    dataset_allow
}

allow {
     ## delegate content related decision to content_allowRead
    startswith(input.operationUri, "object/content/")
    
    ## Operation type must be read
    endswith(input.operationUri, "/read")

    content_allowRead
}
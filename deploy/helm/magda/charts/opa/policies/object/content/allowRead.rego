package object.content

import data.object.dataset.hasAnyDraftReadPermission
import data.object.dataset.hasAnyPublishedReadPermission

getContentIdFromOperationUri(operationUri) = contentId {
    parts := split(operationUri, "/")
    contentId := concat("/", array.slice(parts, 2, count(parts)-1))
}

controlledItems[item] {
    item := {
        "uri": "header/navigation/drafts",
        "allow": hasAnyDraftReadPermission
    }
}

controlledItems[item] {
    item := {
        "uri": "header/navigation/datasets",
        "allow": hasAnyPublishedReadPermission
    }
}

default allowRead = false

default isValidAllowReadUri = false

isValidAllowReadUri {
    ## res type must be resource object/content
    startswith(input.operationUri, "object/content/")
    
    ## Operation type must be read
    endswith(input.operationUri, "/read")

    ## if operation uri is in invalid form:
    ## minimun size uri: object/content/includeHtml/read
    ## more common example: object/content/header/*/read
    parts := split(input.operationUri, "/")
    count(parts) >= 4
}

## unknowns input.content

### Define content items always allowed to access
allowRead {
    isValidAllowReadUri == true
    contentId := getContentIdFromOperationUri(input.operationUri)
    controlledItems[itemHasNoAccess].allow = false
    glob.match(contentId, ["/"], itemHasNoAccess.uri) == true
    input.object.content.id != itemHasNoAccess.uri
}

allowRead {
    isValidAllowReadUri == true
    contentId := getContentIdFromOperationUri(input.operationUri)
    uris := [uri | uri := controlledItems[_].uri; glob.match(contentId, ["/"], uri) == true ]
    count(uris) == 0
}
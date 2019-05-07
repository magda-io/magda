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
    
    ## It's not a pattern
    contains(contentId, "*") != true

    disallowedUris := [uri | uri := controlledItems[i].uri; controlledItems[i].allow = false]

    disallowedUris[_] != contentId
    
    input.object.content.id == contentId
}

allowRead {
    isValidAllowReadUri == true
    contentId := getContentIdFromOperationUri(input.operationUri)
    
    ## It's a pattern
    contains(contentId, "*") == true

    disallowedUris := [uri | uri := controlledItems[i].uri; 
                             glob.match(contentId, ["/"], uri) == true;
                             controlledItems[i].allow = false]

    count(disallowedUris) == 0
    # No matched disallowedUris found, thus, allow
}

allowRead {
    isValidAllowReadUri == true
    contentId := getContentIdFromOperationUri(input.operationUri)
    
    ## It's a pattern
    contains(contentId, "*") == true

    disallowedUris := [uri | uri := controlledItems[i].uri; 
                             glob.match(contentId, ["/"], uri) == true;
                             controlledItems[i].allow = false]

    count(disallowedUris) > 0
    
    input.object.content.id != disallowedUris[_]
}

package object.content

import data.object.dataset.hasAnyDraftReadPermission
import data.object.dataset.hasAnyPublishedReadPermission

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

getContentIdFromOperationUri(operationUri) = contentId {
    parts := split(operationUri, "/")
    contentId := concat("/", array.slice(parts, 2, count(parts)-1))
}

## unknowns input.content

### Define content items always allowed to access
allowRead {
    isValidAllowReadUri
    contentId := getContentIdFromOperationUri(input.operationUri)
    not glob.match(contentId, ["/"], "header/navigation/drafts")
    not glob.match(contentId, ["/"], "header/navigation/datasets")
}

### Define whether a user has access to header/navigation/drafts

## Use generic glob parttern to match contentId
## example: header/** or header/*/drafts or header/navigation/drafts
## Please note: header/* won't match header/navigation/drafts
allowRead {
    isValidAllowReadUri
    contentId := getContentIdFromOperationUri(input.operationUri)
    trace(sprintf("Hello There! %v", [contentId]))
    glob.match(contentId, ["/"], "header/navigation/drafts")
    hasAnyDraftReadPermission
    input.object.content.id = "header/navigation/drafts"
}


### Define whether a user has access to header/navigation/datasets

## Use generic glob parttern to match contentId
## example: header/** or header/*/datasets or header/navigation/datasets
## Please note: header/* won't match header/navigation/datasets
allowRead {
    isValidAllowReadUri
    contentId := getContentIdFromOperationUri(input.operationUri)
    glob.match(contentId, ["/"], "header/navigation/datasets")
    hasAnyPublishedReadPermission
    input.object.content.id = "header/navigation/datasets"
}
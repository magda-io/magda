package object.content

default allow = false

## unknowns input.content

getContentIdFromOperationUri(operationUri) = contentId {
    parts := split(operationUri, "/")
    # Getting ContentId from Resource URI e.g.
    # e.g. object/content/header/* to header/*
    contentId := concat("/", array.slice(parts, 2, count(parts)))
}

## Only limit the access to header or footer items
allow {
    startswith(input.operationUri, "object/content")
    ## if uri not start with object/content/header
    startswith(input.operationUri, "object/content/header") != true
    ## and uri not start with object/content/footer then always allowed
    startswith(input.operationUri, "object/content/footer") != true
}

allow {
    ## when uri contains *
    contains(input.operationUri, "*")
    ## Use glob match rules
    glob.match(input.operationUri, ["/"], input.user.permissions[i].operations[_].uri)
    # content resource doesn't support any the folowing features at this moment
    input.user.permissions[i].userOwnershipConstraint = false
    input.user.permissions[i].orgUnitOwnershipConstraint = false
    input.user.permissions[i].preAuthorisedConstraint = false

    # lookup dataset
    input.object.content.id = getContentIdFromOperationUri(input.user.permissions[i].operations[_].uri)
}

allow {
    ## when uri not contains *
    contains(input.operationUri, "*") != true
    # one permission operation url match this
    input.user.permissions[i].operations[_].uri = input.operationUri
    # content resource doesn't support any the folowing features at this moment
    input.user.permissions[i].userOwnershipConstraint = false
    input.user.permissions[i].orgUnitOwnershipConstraint = false
    input.user.permissions[i].preAuthorisedConstraint = false

    # lookup dataset
    input.object.content.id = getContentIdFromOperationUri(input.user.permissions[i].operations[_].uri)
}
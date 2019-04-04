package au.csiro.data61.magda.httpRequest

response [x] {
    request := {
        "url": "https://data.gov.au/api/v0/registry/records/ds-wa-0f28e25f-df3c-4066-b485-565f77e3acf2?dereference=true&aspect=dcat-dataset-strings&optionalAspect=dcat-distribution-strings&optionalAspect=dataset-distributions&optionalAspect=temporal-coverage&optionalAspect=dataset-publisher&optionalAspect=source&optionalAspect=source-link-status&optionalAspect=dataset-quality-rating",
        "force_json_decode": true,
        "method": "get"
    }

    output := http.send(request)
    x := output.body
}
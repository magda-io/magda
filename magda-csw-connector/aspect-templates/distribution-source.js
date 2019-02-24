const csw = libraries.csw;
const jsonpath = libraries.jsonpath;

const urnIdentifier = jsonpath.value(
    dataset.json,
    "$..MD_Identifier[?(@.codeSpace[0].CharacterString[0]._=='urn:uuid')].code.._"
);

const gaDataSetURI = jsonpath.value(
    jsonpath.nodes(
        dataset.json,
        "$..MD_Identifier[?(@.codeSpace[0].CharacterString[0]._=='ga-dataSetURI')]"
    ),
    "$.._"
);

const fileIdentifier = jsonpath.value(
    dataset.json,
    "$.fileIdentifier[*].CharacterString[*]._"
);

return {
    type: "csw-distribution",
    url:
        gaDataSetURI ||
        csw.getRecordByIdUrl(fileIdentifier) ||
        csw.getRecordByIdUrl(urnIdentifier),
    id: csw.id,
    name: csw.name
};

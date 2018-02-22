const csw = libraries.csw;
const jsonpath = libraries.jsonpath;

const identifier = jsonpath.value(
    dataset.json,
    "$.fileIdentifier[*].CharacterString[*]._"
);

return {
    type: "csw-distribution",
    url: csw.getRecordByIdUrl(identifier),
    id: csw.id,
    name: csw.name
};

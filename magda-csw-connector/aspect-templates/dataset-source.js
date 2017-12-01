const csw = libraries.csw;
const jsonpath = libraries.jsonpath;

const identifier = jsonpath.value(dataset.json, '$.fileIdentifier[*].CharacterString[*]._');

return {
    type: 'csw-dataset',
    url: csw.getRecordByIdUrl(identifier),
    name: csw.name,
    retrievedAt: csw.retrievedAt
};

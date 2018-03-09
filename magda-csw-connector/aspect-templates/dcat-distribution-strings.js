const jsonpath = libraries.jsonpath;

const identifier = jsonpath.value(
    dataset.json,
    "$.fileIdentifier[*].CharacterString[*]._"
);
const dataIdentification = jsonpath.query(
    dataset.json,
    "$.identificationInfo[*].MD_DataIdentification[*]"
);
const serviceIdentification = jsonpath.query(
    dataset.json,
    "$.identificationInfo[*].SV_ServiceIdentification[*]"
);
const identification = dataIdentification.concat(serviceIdentification);

const constraints = jsonpath.query(
    identification,
    "$[*].resourceConstraints[*]"
);
const licenseName = jsonpath.value(constraints, "$[*].licenseName[*]._");
const licenseUrl = jsonpath.value(constraints, "$[*].licenseLink[*]._");
const license =
    licenseName || licenseUrl
        ? [licenseName, licenseUrl].filter(item => item !== undefined).join(" ")
        : undefined;
const rights = jsonpath.value(
    constraints,
    "$[*].MD_LegalConstraints[*].useLimitation[*].CharacterString[*]._"
);

const title = jsonpath.value(distribution, "$.name[*].CharacterString[*]._");
const description = jsonpath.value(
    distribution,
    "$.description[*].CharacterString[*]._"
);
const url = jsonpath.value(distribution, "$.linkage[*].URL[*]._");
const format = jsonpath.value(
    distribution,
    "$.protocol[*].CharacterString[*]._"
);
const isDownload =
    jsonpath.value(distribution, "$.function[*].CI_OnlineFunctionCode[*]._") ===
    "download";

return {
    title: title,
    description: description,
    issued: undefined,
    modified: undefined,
    license: license,
    rights: rights,
    accessURL: isDownload ? undefined : url,
    downloadURL: isDownload ? url : undefined,
    byteSize: undefined,
    mediaType: undefined,
    format: format
};

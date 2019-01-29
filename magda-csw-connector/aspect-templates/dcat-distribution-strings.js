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
let license =
    licenseName || licenseUrl
        ? [licenseName, licenseUrl].filter(item => item !== undefined).join(" ")
        : undefined;
if (!license) {
    const legalConstraints = jsonpath
        .nodes(dataset.json, "$..MD_LegalConstraints[*]")
        .map(node => {
            return {
                ...node,
                title:
                    jsonpath.value(node, "$..title[*].CharacterString[*]._") ||
                    jsonpath.value(
                        node,
                        "$..otherConstraints[*].CharacterString[*]._"
                    ),
                codeListValue: jsonpath.value(node, "$..MD_RestrictionCode[0]")
                    ? jsonpath.value(node, "$..MD_RestrictionCode[0]").$
                          .codeListValue.value
                    : undefined
            };
        });
    // try looking for just creative commons licences
    license = legalConstraints
        .filter(
            lc =>
                lc.codeListValue == "license" &&
                lc.title &&
                lc.title.search(
                    /Creative Commons|CC |BY|Attribution|creativecommons/
                )
        )
        .map(lc => {
            return lc.title;
        })
        .join(" ");

    if (!license) {
        license = legalConstraints
            .filter(lc => lc.codeListValue == "license" && lc.title)
            .map(lc => {
                return lc.title;
            })
            .join(" ");
    }
    if (license.length === 0) {
        license = undefined;
    }
}
const rights = jsonpath.value(
    constraints,
    "$[*].MD_LegalConstraints[*].useLimitation[*].CharacterString[*]._"
);

const title = jsonpath.value(distribution, "$.name[*].CharacterString[*]._");
const description = jsonpath.value(
    distribution,
    "$.description[*].CharacterString[*]._"
);
const url =
    jsonpath.value(distribution, "$.linkage[" + "*].URL[*]._") ||
    jsonpath.value(distribution, "$.linkage[" + "*].CharacterString[*]._");

let format = jsonpath.value(distribution, "$.protocol[*].CharacterString[*]._");

if (!format) {
    format = jsonpath.value(
        dataset.json,
        "$.distributionInfo[*].MD_Distribution[*].distributor[*].MD_Distributor[*].distributorFormat[*].MD_Format[*].name[*].CharacterString[*]._"
    );
}

const isDownload =
    jsonpath.value(distribution, "$.function[*].CI_OnlineFunctionCode[*]._") ===
    "download";

const issued =
    jsonpath.value(dataset.json, "$.dateStamp[*].Date[*]._") || undefined;

return {
    title: title,
    description: description,
    issued: issued,
    modified: undefined,
    license: license,
    rights: rights,
    accessURL: isDownload ? undefined : url,
    downloadURL: isDownload ? url : undefined,
    byteSize: undefined,
    mediaType: undefined,
    format: format
};

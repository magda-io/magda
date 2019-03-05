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
/**
 * If more than one license description is found, the shorter one (e.g. `CC - Attribution (CC BY)`)
 * normally is the license title and the longer string is the description.
 * Here, the sort func makes sure the license title always be shown in front of the long description block.
 */
const licenseSortFunc = (lcA, lcB) => {
    let lenA = 0,
        lenB = 0;
    if (lcA && lcA.length) {
        lenA = lcA.length;
    }
    if (lcB && lcB.length) {
        lenB = lcB.length;
    }
    return lenA - lenB;
};
let license =
    licenseName || licenseUrl
        ? [licenseName, licenseUrl]
              .filter(item => item !== undefined)
              .sort(licenseSortFunc)
              .join("\n")
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
                    /Creative Commons|CC BY|CC - Attribution|creativecommons/i
                ) !== -1
        )
        .map(lc => {
            return lc.title;
        })
        .sort(licenseSortFunc)
        .join("\n");

    if (!license) {
        license = legalConstraints
            .filter(lc => lc.codeListValue == "license" && lc.title)
            .map(lc => {
                return lc.title;
            })
            .sort(licenseSortFunc)
            .join("\n");
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

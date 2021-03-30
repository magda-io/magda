import { Record } from "magda-typescript-common/src/generated/registry/api";
import { printDate } from "./common";

const distribution = (
    distribution: Record,
    dataset: Record,
    baseUrl: string
) => {
    const datasetAspects = dataset?.aspects;
    const dcatDatasetStrings = datasetAspects?.["dcat-dataset-strings"];
    const orgDetails =
        datasetAspects?.["dataset-publisher"]?.publisher?.aspects?.[
            "organization-details"
        ];

    const datasetTitle = dcatDatasetStrings?.title
        ? dcatDatasetStrings.title
        : "Untitled Dataset";

    const orgName = dcatDatasetStrings?.publisher
        ? dcatDatasetStrings.publisher
        : orgDetails?.title
        ? orgDetails.title
        : "";

    const disAspects = distribution?.aspects;
    const dcatDisStrings = disAspects?.["dcat-distribution-strings"];
    const disTitle = dcatDisStrings?.title
        ? dcatDisStrings.title
        : "Untitled Distribution";
    const format = disAspects?.["dataset-format"]?.format
        ? disAspects["dataset-format"].format
        : dcatDisStrings?.format
        ? dcatDisStrings.format
        : "N/A";

    return `---
title: ${JSON.stringify(`Distribution: ${disTitle}`)}
---
# Distribution: ${disTitle}
## Dataset: [${datasetTitle}](${`${baseUrl}dataset/${dataset.id}`})
---
## Description

${dcatDisStrings?.description}

## General Information

${
    orgName
        ? `- ${orgName}${
              orgDetails?.jurisdiction ? ` (${orgDetails.jurisdiction})` : ""
          }`
        : ""
}
- Create Date: ${printDate(dcatDisStrings?.issued)}
- Update Date: ${printDate(dcatDisStrings?.modified)}
- License: ${dcatDisStrings?.license ? dcatDisStrings.license : "N/A"}
- Format: ${format}
- Download/Access URL: ${
        dcatDisStrings?.accessURL
            ? `[${dcatDisStrings.accessURL}](${dcatDisStrings.accessURL})`
            : dcatDisStrings?.downloadURL
            ? `[${dcatDisStrings.downloadURL}](${dcatDisStrings.downloadURL})`
            : "N/A"
    }${
        dcatDisStrings?.accessNotes
            ? `\n- Access Notes: ${dcatDisStrings.accessNotes}`
            : ""
    }
`;
};

export default distribution;

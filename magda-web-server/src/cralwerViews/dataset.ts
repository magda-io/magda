import { Record } from "magda-typescript-common/src/generated/registry/api";
import { printDate } from "./common";

const dataset = (record: Record, baseUrl: string) => {
    const datasetId = record.id;
    const aspects = record?.aspects;
    const dcatDatasetStrings = aspects?.["dcat-dataset-strings"];
    const orgDetails =
        aspects?.["dataset-publisher"]?.publisher?.aspects?.[
            "organization-details"
        ];

    const title = dcatDatasetStrings?.title
        ? dcatDatasetStrings.title
        : "Untitled";

    const orgName = dcatDatasetStrings?.publisher
        ? dcatDatasetStrings.publisher
        : orgDetails?.title
        ? orgDetails.title
        : "";

    const distributions: Record[] = aspects?.["dataset-distributions"]
        ?.distributions?.length
        ? aspects["dataset-distributions"].distributions
        : [];

    return `---
title: Dataset: ${title}
---
# Dataset: ${title}
---
## General Information

${
    orgName
        ? `- ${orgName}${
              orgDetails?.jurisdiction ? ` (${orgDetails.jurisdiction})` : ""
          }`
        : ""
}
- Create Date: ${printDate(dcatDatasetStrings?.issued)}
- Update Date: ${printDate(dcatDatasetStrings?.modified)}
- Landing Page: ${
        dcatDatasetStrings?.landingPage
            ? `[${dcatDatasetStrings.landingPage}](${dcatDatasetStrings.landingPage})`
            : "N/A"
    }${
        !dcatDatasetStrings?.keywords?.length
            ? ""
            : "\n- Keywords:\n" +
              dcatDatasetStrings.keywords
                  .map((keyword: string) => `  - ${keyword}`)
                  .join("\n")
    }

## Description

${dcatDatasetStrings?.description}

## Distributions

${distributions
    .map((dis) => {
        const aspects = dis?.aspects;
        const dcatDisStrings = aspects?.["dcat-distribution-strings"];
        const title = dcatDisStrings?.title ? dcatDisStrings.title : "Untitled";

        return (
            `- [${title}](${baseUrl}/dataset/${datasetId}/distribution/${dis.id})\n` +
            `  - Format: ${
                aspects?.["dataset-format"]?.format
                    ? aspects["dataset-format"].format
                    : dcatDisStrings?.format
                    ? dcatDisStrings.format
                    : "N/A"
            }\n` +
            `  - License: ${
                dcatDisStrings?.license ? dcatDisStrings.license : "N/A"
            }\n` +
            `  - Create Date: ${printDate(dcatDisStrings?.issued)}\n` +
            `  - Update Date: ${printDate(dcatDisStrings?.modified)}`
        );
    })
    .join("\n")}
`;
};

export default dataset;

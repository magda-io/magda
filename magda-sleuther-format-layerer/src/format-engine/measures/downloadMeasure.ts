import { Record } from "@magda/typescript-common/src/generated/registry/api";
import * as mimeTypes from "mime-types";
import { getCommonFormat } from "../formats";
import MeasureResult from "./MeasureResult";

/*
* Tries to determine the format by downloading the downloadURL, and deciphering the MIME type
* TODO not thouroughly unit tested
*/
export default function getMeasureResult(relatedDistribution: Record): MeasureResult {
    const { downloadURL } = relatedDistribution.aspects[
        "dcat-distribution-strings"
    ];
    const rawMime: string | false = mimeTypes.lookup(downloadURL);

    if (!rawMime) {
        return null;
    }

    const processedMime: string = rawMime.split("/")[1];
    return {
        formats: [
            {
                format: getCommonFormat(processedMime),
                correctConfidenceLevel: 100
            }
        ],
        distribution: relatedDistribution
    };
}

import * as mimeTypes from "mime-types";
import { getCommonFormat } from "../formats";
import MeasureResult from "./MeasureResult";

/*
* Tries to determine the format by downloading the accessURL, and deciphering the MIME type
* NOTE: no unit tests made for this measure as it's virtually the same as download measure as of now (may change in future)
*/
export default function getMeasureResult(relatedDistribution: any, synonymObject: any): MeasureResult {
    const { accessURL } = relatedDistribution.aspects[
        "dcat-distribution-strings"
    ];
    const rawMime: string | false = mimeTypes.lookup(accessURL);

    if (!rawMime) {
        return null;
    }

    const processedMime: string = rawMime.split("/")[1];
    return {
        formats: [
            {
                format: getCommonFormat(processedMime, synonymObject),
                correctConfidenceLevel: 100
            }
        ],
        distribution: relatedDistribution
    };
}

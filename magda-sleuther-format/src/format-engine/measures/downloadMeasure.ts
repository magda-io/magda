import * as mimeTypes from "mime-types";
import { getCommonFormat } from "../formats";
import MeasureResult from "./MeasureResult";

/*
* Tries to determine the format by downloading the downloadURL, and deciphering the MIME type
* TODO not thouroughly unit tested
*/
export default function getMeasureResult(
    relatedDistribution: any,
    synonymObject: any, 
    rating:number): MeasureResult {
    const { downloadURL } = relatedDistribution.aspects[
        "dcat-distribution-strings"
    ];
    const rawMime: string | false = mimeTypes.lookup(downloadURL);

    if (!rawMime) {
        return null;
    }

    const processedMime: string = rawMime.split("/")[1];
    return {
        formats: [getCommonFormat(processedMime, synonymObject)],
        distribution: relatedDistribution,
        measureRating: rating
    };
}

/*
* Tries to determine the format by deciphering DCAT-DISTRIBUTION-STRING -> format
* TODO Unit tests
*/

import { Record } from "@magda/typescript-common/dist/generated/registry/api";
import { getCommonFormat } from "../formats";
import MeasureResult from "./MeasureResult";

function applyTransform(format: string, transformFormat: any) {
    const newFormat = transformFormat(format);
    return newFormat;
}

function lowerCase(str: string) {
    return str.toLowerCase();
}

function removePeriod(str: string) {
    return str.split(".").join("");
}

function replaceCommaThenSpace(str: string) {
    return str.split(", ").join(" ");
}

function replaceSpaceThenComma(str: string) {
    return str.split(" ,").join(" ");
}

function replaceComma(str: string) {
    return str.split(",").join(" ");
}

export default function getMeasureResult(
    relatedDistribution: Record
): MeasureResult {
    const { format } = relatedDistribution.aspects["dcat-distribution-strings"];

    if (format === null || format === "") {
        return null;
    }

    let processedFormat: string;

    const transforms = [
        (str: string) =>
            lowerCase(
                removePeriod(
                    replaceComma(
                        replaceSpaceThenComma(replaceCommaThenSpace(str))
                    )
                )
            )
    ];

    for (const tf of transforms) {
        processedFormat = applyTransform(format, tf);
    }

    // hard coded rules for separating out multiple formats when provided
    let splitFormat: Array<string> = [];
    let finalFormat: Array<string> = [];

    // e.g: application/exe
    splitFormat = processedFormat.split("/");
    if (splitFormat.length > 2)
        throw new Error(
            "a MIME type has more than 1 slash: " + processedFormat
        );
    if (splitFormat.length > 1) finalFormat.push(splitFormat[1]);
    else {
        // E.g. pdf & xlsx & doc & docx & ogg
        splitFormat = processedFormat.split(" & ");
        if (splitFormat.length > 1) finalFormat = splitFormat;
        else {
            splitFormat = processedFormat.split(" ");
            if (splitFormat.length > 1) {
                // E.g. zip (xlsx)
                if (processedFormat.indexOf("(") > -1) {
                    //TODO make this more efficient or elegant
                    let length: number =
                        processedFormat.substr(processedFormat.indexOf(")"))
                            .length -
                        processedFormat.substr(processedFormat.indexOf("("))
                            .length;
                    finalFormat.push(processedFormat.substr(
                        processedFormat.indexOf("("),
                        length
                    ));
                } else {
                    // E.g. ATOM
                    finalFormat.push(splitFormat[0]);
                }
            } else {
                console.log("f:" + finalFormat);
                // can only deduce 1 format in this scenario
                finalFormat.push(processedFormat);
            }
        }
    }

    if (finalFormat.length < 1) {
        return null;
    } else {
        return {
            formats: finalFormat.map(eachFormat => {
                return {
                    format: getCommonFormat(eachFormat),
                    correctConfidenceLevel: 100
                };
            }),
            distribution: relatedDistribution
        };
    }
}

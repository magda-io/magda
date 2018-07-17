/*
* Tries to determine the format by deciphering DCAT-DISTRIBUTION-STRING -> format
* TODO add more unit tests to test foundational function and more permutations of other functions
*/
import { getCommonFormat } from "../formats";
import MeasureResult from "./MeasureResult";
import { SelectedFormat } from "../formats";
import * as _ from "lodash";

// list of functions that clean up the dcat-string so that magda can understand it
// all functions must be executed in the order they appear in this file

/**
 * Removes falsy values
 */
function removeFalsy(formats: Array<string>): Array<string> {
    return formats.filter(x => !!x);
}

/**
 * Removes commas, periods, and makes everything lower case
 * @param format the current format string to clean up
 */
function foundationalCleanup(formats: Array<string>): Array<string> {
    return formats.map(format =>
        format
            .toString()
            .toLowerCase()
            .replace(/\s*[.,]\s*/g, " ")
    );
}

/**
 * turns ['pdf   & (xlsx)'] into ['pdf', '(xlsx)'] or ['pdf, xlsx'] into ['pdf, xlsx']
 */
function replaceAmpersandFormats(formats: Array<string>): Array<string> {
    return _(formats)
        .flatMap((format: string) => format.split(/\s*\&\s*/g))
        .value();
}

/**
 * split white space separated stuff into an array:
 * ['zip (xlsx)'] -> ['zip', '(xlsx)']
 */
function splitWhiteSpaceFormats(formats: Array<string>): Array<string> {
    return _(formats)
        .flatMap((format: string) => format.split(/\s+/g))
        .value();
}

/**
 * replace ['application/exe'] with ['exe'] or ['pdf'] with ['pdf']
 */
function reduceMimeType(formats: Array<string>): Array<string> {
    return formats.map(
        format => {
            const idx = format.lastIndexOf("/");
            if(idx == -1 || idx >= format.length-1){
                return format;
            }
            return format.substr(idx+1);
        }  
    );
}

/**
 * under the philosophy that ckan format strings have the actual format in (), if there's more than 1 format, and
 * 1 of those formats are inside (), select () only.
 * Example: ['zip', '(xlsx)', '(pdf)'] -> ['xlsx', 'pdf']
 * ['zip', 'xlsx', 'pdf'] -> ['zip', 'xlsx', 'pdf']
 */
function filterBracketedFormats(formats: Array<string>) {
    return getFilteredBracketedFormats(formats).length < 1
        ? formats
        : getFilteredBracketedFormats(formats).map(str =>
              // replace all brackets
              str.replace(/(\(|\)+)/g, "")
          );
}

function getFilteredBracketedFormats(formats: Array<string>) {
    return formats.filter(format => {
        return format.indexOf("(") > -1 && format.indexOf(")") > -1;
    });
}

export default function getMeasureResult(
    relatedDistribution: any,
    synonymObject: any
): MeasureResult {
    const { format } = relatedDistribution.aspects["dcat-distribution-strings"];

    if (format === null || format === "") {
        return null;
    }

    let processedFormats: Array<string>;

    const preProcessChain = [removeFalsy];

    processedFormats = preProcessChain.reduce(
        (accumulation, currentTransformer) => currentTransformer(accumulation),
        [format]
    );

    const tmpProcessedResult: Array<SelectedFormat> = processedFormats
        .map(f => {
            const format = getCommonFormat(f, synonymObject, true);
            if (!format) return null;
            return {
                format,
                correctConfidenceLevel: 100
            };
        })
        .filter(item => !!item);

    //-- allow early exit so that format `OCG WFS` or esri rest` won't be broken
    if (tmpProcessedResult.length) {
        return {
            formats: tmpProcessedResult,
            distribution: relatedDistribution
        };
    }

    // this is an array that acts like an assembly belt, you input in the string, the middle functions are the assembly robots,
    // and the last function returns the output.
    const cleanUpAssemblyChain = [
        foundationalCleanup,
        replaceAmpersandFormats,
        splitWhiteSpaceFormats,
        reduceMimeType,
        filterBracketedFormats
    ];

    processedFormats = cleanUpAssemblyChain.reduce(
        (accumulation, currentTransformer) => currentTransformer(accumulation),
        processedFormats
    );

    if (processedFormats.length < 1) {
        return null;
    } else {
        return {
            formats: processedFormats.map(eachFormat => {
                return {
                    format: getCommonFormat(eachFormat, synonymObject),
                    correctConfidenceLevel: 100
                };
            }),
            distribution: relatedDistribution
        };
    }
}

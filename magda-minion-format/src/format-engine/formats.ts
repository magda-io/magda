import escapeStringRegexp from "escape-string-regexp";
import _ from "lodash";
/**
 * Tries and find the Magda-readable file format from this raw format
 * @param rawFormat The format collected directly from some datasource
 */
export function getCommonFormat(
    rawFormat: string,
    synonymObject: any,
    noRawFormatOutput: boolean = false
): string {
    const format = _.trim(rawFormat.toString()).toUpperCase();

    if (synonymObject[format]) {
        return format;
    } else {
        for (let label of Object.keys(synonymObject)) {
            for (var i = 0; i < synonymObject[label].length; i++) {
                if (
                    typeof synonymObject[label][i] === "string" &&
                    synonymObject[label][i].toString().toUpperCase() === format
                )
                    return label.toUpperCase();
                else if (
                    typeof synonymObject[label][i] === "object" &&
                    synonymObject[label][i].type &&
                    synonymObject[label][i].data
                ) {
                    switch (synonymObject[label][i].type) {
                        case "as-keyword":
                            if (
                                new RegExp(
                                    `(^|\\b)${escapeStringRegexp(
                                        synonymObject[label][i].data
                                    )}(\\b|$)`,
                                    "i"
                                ).test(format)
                            )
                                return label.toUpperCase();
                    }
                }
            }
        }

        if (format.startsWith("WWW:")) {
            // There are a million WWW: formats - if we haven't synonym'd them as HTML, assume they're rubbish
            return null;
        } else {
            //-- need this switch to reuse this function in dcatFormatMeasure
            if (noRawFormatOutput) return null;
            // Can't find a synonym, just return the actual format.
            return rawFormat.toUpperCase();
        }
    }
}

export interface SelectedFormat {
    format: string;
    correctConfidenceLevel: number;
}

/**
 * Tries and find the Magda-readable file format from this raw format
 * @param rawFormat The format collected directly from some datasource
 */
export function getCommonFormat(rawFormat: string, synonymObject: any): string {
    const format = rawFormat.toString().toUpperCase();
    if (synonymObject[format]) {
        return format;
    } else {
        for (let label of Object.keys(synonymObject)) {
            for (var i = 0; i < synonymObject[label].length; i++) {
                if (
                    synonymObject[label][i].toString().toUpperCase() === format
                ) {
                    return label.toUpperCase();
                }
            }
        }

        if (format.startsWith("WWW:")) {
            // There are a million WWW: formats - if we haven't synonym'd them as HTML, assume they're rubbish
            return null;
        } else {
            // Can't find a synonym, just return the actual format.
            return rawFormat.toUpperCase();
        }
    }
}

export interface SelectedFormat {
    format: string;
    correctConfidenceLevel: number;
}

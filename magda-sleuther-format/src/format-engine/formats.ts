//TODO make synonym table
//TODO fill out all formats that are possible in here
export enum Formats {
    SVG = "SVG",
    HTML = "HTML",
    XML = "XML",
    XLSX = "XLSX",
    PDF = "PDF",
    TXT = "TXT",
    DOCX = "DOCX",
    MSWORD = "MSWORD",
    CSV = "CSV",
    OTHER = "OTHER"
}

/**
 * Tries and find the Magda-readable file format from this raw format
 * @param rawFormat The format collected directly from some datasource
 */
export function getCommonFormat(
    rawFormat: string,
    synonymObject: any
): Formats {
    let commonFormat: Formats = (<any>Formats)[rawFormat.toString().toUpperCase()];
    if (commonFormat) {
        return commonFormat;
    } else {
        for (let label of Object.keys(synonymObject)) {
            for (var i = 0; i < synonymObject[label].length; i++) {
                if (
                    synonymObject[label][i].toString().toLowerCase() ===
                    rawFormat.toString().toLowerCase()
                ) {
                    return (
                        (<any>Formats)[label.toString().toUpperCase()] ||
                        new Error(
                            "There is no " +
                                label +
                                " format in the Formats enum"
                        )
                    );
                }
            }
        }

        throw new Error(
            "Couldn't find an equivelant synonym for: " +
                rawFormat.toString().toLowerCase()
        );
    }
}


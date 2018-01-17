import * as fs from 'fs';

export var mochaObject = {
    isRunning: false,
    testVariables: {
        synonymTable: {}
    }
}
//TODO make synonym table
//TODO fill out all formats that are possible in here
export enum Formats {
    SVG = "SVG",
    HTML = "HTML",
    XML = "XML",
    XLSX = "XLSX",
    PDF = "PDF",
    TXT = "TXT",
    DOCS = "DOCS",
    MSWORD = "MSWORD",
    OTHER = "OTHER"
}

/**
 * Tries and find the Magda-readable file format from this raw format 
 * @param rawFormat The format collected directly from some datasource
 */
export function getCommonFormat(rawFormat: string): Formats {
    let commonFormat: Formats = (<any>Formats)[rawFormat.toUpperCase()];
    if(commonFormat) {
        return commonFormat;
    } else {
        let json: any;

        try {
            if(mochaObject.isRunning) {
                json = mochaObject.testVariables.synonymTable;
            } else {
                json = getSynonymObject();
            }

            for(var label in json) {
                for(var i = 0; i < json[label].length; i++) {
                    if(json[label][i].toLowerCase() === rawFormat.toLowerCase()) {
                        return (<any>Formats)[label.toUpperCase()] || new Error("There is no " + label + " format in the Formats enum");
                    }
                }
            }

            throw new Error("Couldn't find an equivelant synonym for: " + rawFormat.toLowerCase());
        } catch(message) {
            throw new Error(message);
        }
    }
}

function getSynonymObject(): Object {
    return fs.readFileSync(__dirname + "/synonyms.json").toJSON;
}

export interface SelectedFormat {
    format: Formats,
    correctConfidenceLevel: number
}


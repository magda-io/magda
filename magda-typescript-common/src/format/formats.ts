import * as synonyms from "./synonyms.json"
//TODO make synonym table
//TODO fill out all formats that are possible in here
export enum Formats {
    SVG = "SVG",
    HTML = "HTML",
    XML = "XML",
    XLS = "XLS",
    XLSX = "XLSX",
    PDF = "PDF",
    TXT = "TXT",
    DOC = "DOC",
    DOCS = "DOCS",
    MSWORD = "MSWORD",
    OTHER = "OTHER"
}

/**
 * Tries and find the Magda-readable file format from this raw format 
 * @param rawFormat The format collected directly from some datasource
 */
export function getCommonFormat(rawFormat: string): Formats {
    let commonFormat: Formats = (<any>Formats)[rawFormat];
    if(commonFormat) {
        return commonFormat;
    } else {
        let synonymTable: JSON = synonyms;
        
    }
}

export interface SelectedFormat {
    format: Formats,
    correctConfidenceLevel: number
}
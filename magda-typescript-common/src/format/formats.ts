//TODO figure out a way to give enum elements multiple values (e.g. svg = ["SVG", "svg", "ckan-svg"])
//TODO fill out all formats that are possible in here
import { Record } from "../../dist/generated/registry/api";
export enum Formats {
    SVG = "svg",
    HTML = "html",
    XML = "xml",
    XLS = "xls",
    XLSX = "xlsx",
    PDF = "pdf",
    TXT = "txt",
    DOC = "doc",
    DOCS = "docs"
}

export interface SelectedFormat {
    format: Formats,
    correctConfidenceLevel: number,
    distribution: Record
}
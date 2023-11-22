import XLSX from "xlsx";
import mammoth from "mammoth";
import pdfjsLib from "pdfjs-dist/build/pdf.mjs";
import PDFWorker from "pdfjs-dist/build/pdf.worker.mjs";
import { MAX_KEYWORDS } from "./extractKeywords";
import uniq from "lodash/uniq";
import moment from "moment";
import { FileDetails } from "./types";
(self as any).pdfjsWorker = PDFWorker; // eslint-disable-line

interface ContentExtractorOutput {
    format?: string;
    text?: string;
    workbook?: XLSX.WorkBook;
    datasetTitle?: string;
    author?: string;
    modified?: string;
    keywords?: string[];
    largeTextBlockIdentified?: boolean;
}

function getFileExtension(filename?: string) {
    if (!filename) {
        return "";
    }
    const ext = filename.split(".").pop();
    if (ext === filename) return "";
    return ext;
}

const getFormatFromFileName = (filename?: string) => {
    const ext = getFileExtension(filename);
    return ext ? ext.toUpperCase() : "UNKNOWN";
};

/**
 * Extract contents of file as text if they are text based file formats
 *
 */
export default async function extract(
    input: FileDetails,
    array: Uint8Array
): Promise<ContentExtractorOutput> {
    const name = input.fileName;

    const result: ContentExtractorOutput = await (async () => {
        if (name?.match(/[.]xlsx?$/i)) {
            return {
                ...(await extractSpreadsheetFile(input, array)),
                format: "XLSX"
            };
        } else if (name?.match(/[.]csv/i)) {
            return {
                ...(await extractSpreadsheetFile(input, array)),
                format: "CSV"
            };
        } else if (name?.match(/[.]tsv$/i)) {
            return {
                ...(await extractSpreadsheetFile(input, array)),
                format: "TSV"
            };
        } else if (name?.match(/[.]pdf$/i)) {
            return {
                ...(await extractPDFFile(input, array)),
                format: "PDF"
            };
        } else if (name?.match(/[.]docx?$/i)) {
            return {
                ...(await extractDocumentFile(input)),
                format: "DOCX"
            };
        } else {
            return {
                format: getFormatFromFileName(input.fileName)
            };
        }
    })();

    if (result.text) {
        result.text = result.text.replace(/\n+/g, "\n");
    }

    return result;
}

/**
 * Extracts data/metadata from various spreadsheet formats. Refer to
 * https://github.com/SheetJS/js-xlsx for more details
 */
async function extractSpreadsheetFile(
    input: FileDetails,
    array: Uint8Array
): Promise<{
    workbook: XLSX.WorkBook;
    datasetTitle?: string;
    author?: string;
    modified?: string;
    text?: string;
    keywords?: string[];
    largeTextBlockIdentified: boolean;
}> {
    const workbook = XLSX.read(array, {
        type: "array",
        cellDates: true,
        raw: true
    });

    let datasetTitle: string | undefined;
    let author: string | undefined;
    let modified: string | undefined;
    let text: string | undefined;

    // excel files can have embedded properties; extract those
    const props = workbook.Props;
    if (props) {
        if (props.Title) {
            datasetTitle = props.Title;
        }
        if (props.LastAuthor) {
            author = props.LastAuthor;
        }
        if (props.Author) {
            author = props.Author;
        }
        if (props.ModifiedDate) {
            let modifiedDate = props.ModifiedDate;
            if (typeof modifiedDate === "string") {
                // --- it could be string for some reason sometimes
                // --- only happen for some particular .xls files
                if (moment(modifiedDate).isValid()) {
                    modifiedDate = moment(modifiedDate).toDate();
                }
            }
            if ((modifiedDate as any)?.toISOString) {
                // --- there is still chance that modifiedDate.toISOString is undefined
                modified = modifiedDate.toISOString().substr(0, 10);
            }
        }
    }

    // --- pass to keywords extractor for processing
    const { keywords, largeTextBlockIdentified } = productKeywordsFromInput(
        input,
        array
    );

    if (largeTextBlockIdentified) {
        // --- only generate text for NLP if large text block is detected
        text = Object.values(workbook.Sheets)
            .map((worksheet) => {
                return XLSX.utils
                    .sheet_to_json<string>(worksheet, { raw: true })
                    .map((row) => Object.values(row).join(","))
                    .join("\n");
            })
            .join("\n\n")
            .replace(/\u0000/g, "");
    }

    return {
        workbook,
        datasetTitle,
        author,
        modified,
        keywords,
        text,
        largeTextBlockIdentified
    };
}

const CONTAINS_LETTER = /[a-zA-Z]+/;

function getKeywordsFromWorksheet(
    sheet,
    limit = 0,
    skipFirstRow = false,
    firstRowOnly = false
): { keywords: string[]; largeTextBlockIdentified: boolean } {
    let largeTextBlockIdentified = false;
    const keywords: string[] = [];
    const cancelLoopToken = {};
    try {
        Object.keys(sheet).forEach((key) => {
            if (typeof key !== "string") {
                // --- invalid key
                return;
            }

            if (key[0] === "!") {
                // --- skip meta data
                return;
            }

            const rowNum = key.replace(/[^\d]/g, "");

            if (skipFirstRow && rowNum === "1") {
                // --- skip first row i.e. header row
                return;
            }

            if (firstRowOnly && rowNum !== "1") {
                // --- only first row i.e. header row
                return;
            }

            if (!sheet[key]) {
                return;
            }

            if (
                (sheet[key].t && sheet[key].t !== "s") ||
                typeof sheet[key].v !== "string"
            ) {
                // --- skip not text field
                return;
            }

            let value = sheet[key].v.trim().replace(/\u0000/g, "");

            if (value === "") {
                return;
            }

            if (!CONTAINS_LETTER.test(value)) {
                return;
            }

            if (value.length > 100 || value.split(/\s/).length > 10) {
                // --- will not capture very long content or more than 10 words
                // --- leave to NLP
                largeTextBlockIdentified = true;
                return;
            }

            value = value.toLowerCase().replace(/[,._;?@!^]/g, " ");

            if (keywords.indexOf(value) !== -1) {
                // --- will not create duplicated keywords
                return;
            }

            if (limit > 0 && keywords.length >= limit) {
                // --- skip generating more keywords
                // --- but we still want the loop keep going for large content block detection if not yet detected
                if (largeTextBlockIdentified) {
                    // --- large block detected. Quit loop
                    throw cancelLoopToken;
                } else {
                    // --- not yet detected. Keep digging more data
                    return;
                }
            }

            keywords.push(value);
        });
    } catch (e) {
        // --- allow escape from loop earlier
        if (e !== cancelLoopToken) {
            throw e;
        }
    }

    return { keywords, largeTextBlockIdentified };
}

function productKeywordsFromInput(
    input: FileDetails,
    array: Uint8Array
): { keywords: string[]; largeTextBlockIdentified: boolean } {
    let keywords: string[] = [];
    let largeTextBlockIdentified = false;

    // --- we read the sheet data directly instead of `sheet_to_json` as:
    // --- `sheet_to_json` return [] if there is only one row
    // --- the type data & row num is lost during conversion
    const allSheetsData = Object.values(
        XLSX.read(array, {
            type: "array"
        }).Sheets
    );

    for (let i = 0; i < allSheetsData.length; i++) {
        const {
            keywords: keywordsFromSheet,
            largeTextBlockIdentified: largeTextBlockIdentifiedFromSheet
        } = getKeywordsFromWorksheet(
            allSheetsData[i],
            MAX_KEYWORDS,
            false,
            true
        );
        keywords = uniq(keywords.concat(keywordsFromSheet));
        largeTextBlockIdentified =
            largeTextBlockIdentified || largeTextBlockIdentifiedFromSheet;
        if (keywords.length >= MAX_KEYWORDS && largeTextBlockIdentified) {
            return {
                keywords: keywords.slice(0, MAX_KEYWORDS),
                largeTextBlockIdentified
            };
        }
    }

    if (keywords.length >= MAX_KEYWORDS) {
        keywords = keywords.slice(0, MAX_KEYWORDS);
    }

    // --- we still need to proceed to generate cell keywords if largeTextBlockIdentified not yet detected
    if (largeTextBlockIdentified) {
        return { keywords, largeTextBlockIdentified };
    }

    // --- start to process all cell as not enough keywords produced
    for (let i = 0; i < allSheetsData.length; i++) {
        const {
            keywords: keywordsFromSheet,
            largeTextBlockIdentified: largeTextBlockIdentifiedFromSheet
        } = getKeywordsFromWorksheet(
            allSheetsData[i],
            MAX_KEYWORDS,
            true,
            false
        );

        keywords = uniq(keywords.concat(keywordsFromSheet));
        largeTextBlockIdentified =
            largeTextBlockIdentified && largeTextBlockIdentifiedFromSheet;
        if (keywords.length >= MAX_KEYWORDS && largeTextBlockIdentified) {
            break;
        }
    }

    return {
        keywords: keywords.slice(0, MAX_KEYWORDS),
        largeTextBlockIdentified
    };
}

/**
 * Extracts data/metadata from pdf format.
 */
async function extractPDFFile(_input: FileDetails, array: Uint8Array) {
    let pdf = await pdfjsLib.getDocument({
        data: array
    });

    // pdf files can have embedded properties; extract those
    const meta = await pdf.getMetadata();

    let author: string | undefined;
    let datasetTitle: string | undefined;
    let keywords: string[] | undefined;
    let themes: string[] | undefined;

    if (meta.info) {
        if (meta.info.Author) {
            author = meta.info.Author;
        }

        if (
            typeof meta.info.Title === "string" &&
            meta.info.Title &&
            !meta.info.Title.match(/^[\W]*untitled[\W]*$/i)
        ) {
            datasetTitle = meta.info.Title;
        }

        if (meta.info.Keywords) {
            keywords = meta.info.Keywords.split(/,\s+/g);
        }

        if (meta.info.Subject) {
            themes = [meta.info.Subject];
        }
    }

    // extract text
    const text: string[] = [];

    for (let i = 1; i <= pdf.numPages; i++) {
        let page = await pdf.getPage(i);
        page = await page.getTextContent({
            normalizeWhitespace: true
        });
        page = page.items.map((txt) => txt.str).join("\n");
        text.push(page);
    }

    return { author, datasetTitle, keywords, themes, text: text.join("\n\n") };
}

/**
 * Extracts data/metadata from word format.
 */
async function extractDocumentFile(input: FileDetails) {
    return {
        text: (
            await mammoth.extractRawText({
                arrayBuffer: input.arrayBuffer
            })
        ).value
    };
}

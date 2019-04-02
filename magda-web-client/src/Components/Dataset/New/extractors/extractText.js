import XLSX from "xlsx";
import mammoth from "mammoth";
import pdfjsLib from "pdfjs-dist/build/pdf";
import PDFWorker from "pdfjs-dist/build/pdf.worker";
window.pdfjsWorker = PDFWorker;

/**
 * Extract contents of file as text if they are text based file formats
 *
 */
export async function extractText(input, output) {
    const name = input.file.name;

    if (name.match(/[.]xlsx?$/i)) {
        await extractSpreadsheetFile(input, output);
        output.format = "XLSX";
    } else if (name.match(/[.]csv/i)) {
        await extractSpreadsheetFile(input, output, "csv");
        output.format = "CSV";
    } else if (name.match(/[.]tsv$/i)) {
        await extractSpreadsheetFile(input, output, "csv");
        output.format = "TSV";
    } else if (name.match(/[.]pdf$/i)) {
        await extractPDFFile(input, output);
        output.format = "PDF";
    } else if (name.match(/[.]docx?$/i)) {
        await extractDocumentFile(input, output);
        output.format = "DOCX";
    }

    if (input.text) {
        input.text = input.text.replace(/\n+/g, "\n");
    }
}

/**
 * Extracts data/metadata from various spreadsheet formats. Refer to
 * https://github.com/SheetJS/js-xlsx for more details
 */
async function extractSpreadsheetFile(input, output, bookType = "xlsx") {
    input.workbook = XLSX.read(input.array, {
        type: "array"
    });

    // excel files can have embedded properties; extract those
    const props = input.workbook.Props;
    if (props) {
        if (props.Title) {
            output.datasetTitle = props.Title;
        }
        if (props.LastAuthor) {
            output.author = props.LastAuthor;
        }
        if (props.Author) {
            output.author = props.Author;
        }
        if (props.ModifiedDate) {
            output.modified = props.ModifiedDate.toISOString().substr(0, 10);
        }
    }

    input.text = Object.values(input.workbook.Sheets)
        .map(worksheet => {
            return XLSX.utils
                .sheet_to_json(worksheet)
                .map(row => Object.values(row).join(","))
                .join("\n");
        })
        .join("\n\n");
}

/**
 * Extracts data/metadata from pdf format.
 */
async function extractPDFFile(input, output) {
    let pdf = await pdfjsLib.getDocument({
        data: input.array
    });

    // pdf files can have embedded properties; extract those
    const meta = await pdf.getMetadata();

    if (meta.info) {
        if (meta.info.Author) {
            output.author = meta.info.Author;
        }
        if (meta.info.Title) {
            output.datasetTitle = meta.info.Title;
        }

        if (meta.info.Keywords) {
            output.keywords = meta.info.Keywords.split(/,\s+/g);
        }

        if (meta.info.Subject) {
            output.themes = [meta.info.Subject];
        }
    }

    // extract text
    let text = [];

    for (let i = 1; i <= pdf.numPages; i++) {
        let page = await pdf.getPage(i);
        page = await page.getTextContent({
            normalizeWhitespace: true
        });
        page = page.items.map(txt => txt.str).join("\n");
        text.push(page);
    }

    input.text = text.join("\n\n");
}

/**
 * Extracts data/metadata from word format.
 */
async function extractDocumentFile(input, output) {
    input.text = (await mammoth.extractRawText({
        arrayBuffer: input.arrayBuffer
    })).value;
}

/**
 * @file Load data from a spreadsheet buffer
 */

const XLSX = require("xlsx");
const escape = require("escape-html");

export default function parseSpreadsheet(inputBuffer: Buffer) {
    // console.log(`Reading input bytes: ${inputBuffer.length}`);

    const book = XLSX.read(inputBuffer, {
        cellFormula: false,
        cellHTML: false
    });

    const sheetName = Object.keys(book.Sheets).sort(
        (a, b) =>
            Object.keys(book.Sheets[b]).length -
            Object.keys(book.Sheets[a]).length
    )[0];

    // console.log(
    //     "Taking sheet:",
    //     escape(sheetName),
    //     escape(JSON.stringify(Object.keys(book.Sheets)))
    // );

    const sheet = book.Sheets[sheetName];

    const range = XLSX.utils.decode_range(sheet["!ref"]);

    let rows: any[] = [];
    let blanks = 0;

    let cols: { [name: string]: string[] } = {},
        val: string,
        col: number,
        row: number,
        cell: number;

    // console.log("Taking headings from first row of data.");

    for (col = range.s.c; col <= range.e.c; col++) {
        cell = XLSX.utils.encode_cell({
            r: range.s.r,
            c: col
        });
        if (sheet[cell] !== undefined) {
            val = sheet[cell].w || sheet[cell].v;
            val = escape(val)
                .trim()
                .toLowerCase();
            if (val != "") {
                cols[col] = [val];
                // console.log("Taking column", cell, "as", cols[col]);
            }
        }
    }
    range.s.r++;

    for (row = range.s.r; ; row++) {
        var rowdata: { [name: string]: string } = {};
        for (col = range.s.c; col <= range.e.c; col++) {
            if (cols[col] !== undefined) {
                cell = XLSX.utils.encode_cell({
                    r: row,
                    c: col
                });
                if (sheet[cell] !== undefined) {
                    val = sheet[cell].w || sheet[cell].v;
                    if (val) {
                        val = escape(val).trim();
                        if (val !== "") {
                            if (val.match(/^\d+&#39;$/)) {
                                val = val.replace("&#39;", "");
                            }
                            cols[col].forEach(
                                (head: string) => (rowdata[head] = val)
                            );
                        }
                    }
                }
            }
        }
        if (Object.keys(rowdata).length > 0) {
            rows.push(rowdata);
            blanks = 0;
        } else {
            // we found that range encoded in excel files are often wrong
            // we treat 1024 blank rows as the end of the sheet
            if (++blanks > 1024) {
                break;
            }
        }
    }
    // console.log(rows.length, "rows loaded");

    return rows;
}

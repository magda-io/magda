import getSheetJs from "./getSheetJs";

const NO_DATA_ERROR_MSG = "No data available to export";
const DEFAULT_FILENAME = "download_data";

function createDefaultFileName() {
    const now = Date.now();
    return `${DEFAULT_FILENAME}_${now}.xlsx`;
}

// Convert binary string to ArrayBuffer
function s2ab(s) {
    const buf = new ArrayBuffer(s.length);
    const view = new Uint8Array(buf);
    for (let i = 0; i < s.length; i++) {
        view[i] = s.charCodeAt(i) & 0xff;
    }
    return buf;
}

export default async function downloadCsv(
    rawData: Record<string, any>[],
    filename?: string,
    valueConverter?: (value: any) => any
) {
    const XLSX = await getSheetJs();
    let data: Record<string, any>[];
    if (rawData?.length && typeof rawData?.[0] === "object") {
        data = rawData.map((row) => {
            const newRow = {};
            Object.keys(row).forEach((key) => {
                newRow[key] = valueConverter
                    ? valueConverter(row[key])
                    : row[key];
            });
            return newRow;
        });
    } else {
        data = [
            {
                [NO_DATA_ERROR_MSG]: NO_DATA_ERROR_MSG
            }
        ];
    }
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "download_data");

    const excelBuffer = XLSX.write(workbook, {
        bookType: "xlsx",
        type: "binary"
    });
    const excelBlob = new Blob([s2ab(excelBuffer)], {
        type:
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    });
    const exportFilename = filename ? filename : createDefaultFileName();

    //IE11 & Edge
    if ((navigator as any)?.msSaveBlob) {
        (navigator as any).msSaveBlob(excelBlob, exportFilename);
    } else {
        //In FF link must be added to DOM to be clicked
        const link = document.createElement("a");
        link.href = window.URL.createObjectURL(excelBlob);
        link.setAttribute("download", exportFilename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}

import getPapa from "./getPapa";

const NO_DATA_ERROR_MSG = "No data available to export";
const DEFAULT_FILENAME = "download_data";

function createDefaultFileName() {
    const now = Date.now();
    return `${DEFAULT_FILENAME}_${now}.csv`;
}

export default async function downloadCsv(
    rawData: Record<string, any>[],
    filename?: string
) {
    const papa = await getPapa();
    let data: Record<string, any>[];
    if (rawData?.length && typeof rawData?.[0] === "object") {
        data = rawData;
    } else {
        data = [
            {
                [NO_DATA_ERROR_MSG]: NO_DATA_ERROR_MSG
            }
        ];
    }
    const csvContent = papa.unparse(data);
    const csvBlob = new Blob([csvContent]);
    const exportFilename = filename ? filename : createDefaultFileName();

    //IE11 & Edge
    if ((navigator as any)?.msSaveBlob) {
        (navigator as any).msSaveBlob(csvBlob, exportFilename);
    } else {
        //In FF link must be added to DOM to be clicked
        const link = document.createElement("a");
        link.href = window.URL.createObjectURL(csvBlob);
        link.setAttribute("download", exportFilename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}

import type * as XLSX from "xlsx";

let loadingXlsxPromise: Promise<typeof XLSX> | null = null;

export default async function getSheetJs(): Promise<typeof XLSX> {
    if (loadingXlsxPromise) {
        return await loadingXlsxPromise;
    } else {
        loadingXlsxPromise = import(/* webpackChunkName: "sheetjs" */ "xlsx");
        return await loadingXlsxPromise;
    }
}

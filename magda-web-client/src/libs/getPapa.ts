import type papa from "papaparse";

let loadingPapaPromise: Promise<typeof papa> | null = null;

export default async function getPapa(): Promise<typeof papa> {
    if (loadingPapaPromise) {
        return await loadingPapaPromise;
    } else {
        loadingPapaPromise = import(/* webpackChunkName: "papa" */ "papaparse");
        return await loadingPapaPromise;
    }
}

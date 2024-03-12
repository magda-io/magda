import { PDFWorker } from "pdfjs-dist";

export default async function runWithPdfJsWorker<T = void>(
    fn: (workerPromise: Promise<PDFWorker>) => Promise<T>
) {
    let pdfWorker: PDFWorker | undefined;
    const webWorker: Worker = new Worker(
        /* webpackChunkName: "pdfjs-worker" */ new URL(
            "pdfjs-dist/build/pdf.worker.mjs",
            import.meta.url
        )
    );
    try {
        pdfWorker = new PDFWorker({ port: webWorker as any });
        await pdfWorker.promise;
    } catch (e) {
        // If the worker fails to initialize, just run the function to let it handle the error / rejected promise.
        console.warn("Failed to create pdf.js web worker: ", e);
        try {
            webWorker?.terminate();
        } catch (e) {}
        return await fn(Promise.reject(e));
    }
    try {
        return await fn(Promise.resolve(pdfWorker));
    } finally {
        if (pdfWorker?.destroyed === false) {
            pdfWorker.destroy();
        }
        webWorker?.terminate();
    }
}

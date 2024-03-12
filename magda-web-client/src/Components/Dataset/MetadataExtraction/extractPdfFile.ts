import { FileDetails } from "./types";
import * as pdfjsLib from "pdfjs-dist";
import runWithPdfJsWorker from "../../../helpers/runWithPdfJsWorker";

/**
 * Extracts data/metadata from pdf format.
 */
async function extractPdfFile(_input: FileDetails, array: Uint8Array) {
    return await runWithPdfJsWorker(async (workerPromise) => {
        const pdf = await pdfjsLib.getDocument({
            data: array,
            worker: await workerPromise
        }).promise;
        // pdf files can have embedded properties; extract those
        const meta = await pdf.getMetadata();

        let author: string | undefined;
        let datasetTitle: string | undefined;
        let keywords: string[] | undefined;
        let themes: string[] | undefined;

        if (meta.info) {
            const info = meta.info as any;
            if (info.Author) {
                author = info.Author;
            }

            if (
                typeof info.Title === "string" &&
                info.Title &&
                !info.Title.match(/^[\W]*untitled[\W]*$/i)
            ) {
                datasetTitle = info.Title;
            }

            if (info.Keywords) {
                keywords = info.Keywords.split(/,\s+/g);
            }

            if (info.Subject) {
                themes = [info.Subject];
            }
        }

        // extract text
        const text: string[] = [];

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const pageContent = await page.getTextContent();
            const fullText = pageContent.items
                .map((txt) => (txt as any)?.str)
                .join("\n");
            text.push(fullText);
        }

        return {
            author,
            datasetTitle,
            keywords,
            themes,
            text: text.join("\n\n")
        };
    });
}

export default extractPdfFile;

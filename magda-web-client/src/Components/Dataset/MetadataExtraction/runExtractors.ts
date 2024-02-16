import { config } from "config";
import * as Comlink from "comlink";
import { RunExtractors, MetadataExtractionOutput } from "./types";

interface InputType {
    fileName: string;
    arrayBuffer: ArrayBuffer;
}

async function runExtractors(
    input: InputType,
    handleExtractionProgress: (progress: number) => void
): Promise<MetadataExtractionOutput> {
    let extractors: Comlink.Remote<{
        runExtractors: RunExtractors;
    }> | null = null;

    const extractionWorker = new Worker(
        /* webpackChunkName: "metadata-extraction-worker" */ new URL(
            "./index.ts",
            import.meta.url
        )
    );

    try {
        /**
         * Function for running all extractors in the correct order, which returns
         * a promise that completes when extraction is complete
         */
        extractors = Comlink.wrap(extractionWorker) as Comlink.Remote<{
            runExtractors: RunExtractors;
        }>;

        // Wait for extractors and upload to finish
        return await extractors.runExtractors(
            input,
            (() => {
                const safeConfig = { ...config } as any;
                // We need to delete facets because it has regexs in it,
                // and these cause an error if you try to pass them to
                // the webworker
                delete safeConfig.facets;
                return safeConfig;
            })(),
            Comlink.proxy(handleExtractionProgress)
        );
    } catch (e) {
        console.error("Failed to run metadata extractors", e);
        throw e;
    } finally {
        try {
            if (extractors) {
                extractors[Comlink.releaseProxy]();
            }
        } catch (e) {}
        try {
            extractionWorker?.terminate();
        } catch (e) {}
    }
}

export default runExtractors;

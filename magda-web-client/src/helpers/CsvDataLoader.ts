import { config } from "config";
import getProxiedResourceUrl from "helpers/getProxiedResourceUrl";
import isStorageApiUrl from "helpers/isStorageApiUrl";
// --- as we only import types here, no runtime code will be emitted.
// --- And papaparse will not be included by the main js bundle
import type { Parser, ParseResult, ParseError, ParseMeta } from "papaparse";
import getPapa from "libs/getPapa";
import { ParsedDistribution } from "./record";
import { getSourceUrl } from "./DistributionPreviewUtils";

export type CsvFailureReason = "toobig" | "sizeunknown" | null;
export interface DataLoadingResult {
    parseResult?: ParseResult<any>;
    failureReason?: CsvFailureReason;
    fileLength?: number;
}

type CsvUrlType = string;

type CsvSourceType = CsvUrlType | ParsedDistribution;

const retryLater: <T>(f: () => Promise<T>, delay?: number) => Promise<T> = (
    f,
    delay = 100
) => {
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            try {
                resolve(f());
            } catch (e) {
                reject(e);
            }
        }, delay);
    });
};

class CsvDataLoader {
    private url: CsvUrlType;
    private data: any[] = [];
    private errors: ParseError[] = [];
    private metaData: ParseMeta | null = null;
    private isLoading: boolean = false;

    /**
     * When download & parse process is aborted as result of user or client side event (e.g. component will be unmounted),
     * We set this marker and let loader know it should abort any unfinished processing.
     *
     * @private
     * @type {boolean}
     * @memberof CsvDataLoader
     */
    private toBeAborted: boolean = false;

    /**
     * Flag to skip handling the next call to `complete`.
     *
     * This is necessary because even if we call `parser.abort()`, the parser `onComplete` event will still be triggered,
     * causing the `complete` method to be called here.
     *
     * @private
     * @type {boolean}
     * @memberof CsvDataLoader
     */
    private skipComplete: boolean = false;

    constructor(source: CsvSourceType) {
        this.url = getSourceUrl(source);
    }

    private resetDownloadData() {
        this.data = [];
        this.errors = [];
        this.metaData = null;
        this.isLoading = false;
        this.toBeAborted = false;
        this.skipComplete = false;
    }

    abort() {
        if (!this.isLoading) return;
        this.toBeAborted = true;
    }

    async load(overrideNewLine?: string): Promise<DataLoadingResult> {
        this.resetDownloadData();
        const proxyUrl = getProxiedResourceUrl(this.url, true);

        const csvRes = await fetch(
            proxyUrl,
            isStorageApiUrl(this.url) ? config.commonFetchRequestOptions : {}
        );

        if (!csvRes.ok) {
            throw new Error("Could not retrieve csv: " + csvRes.statusText);
        }

        const Papa = await getPapa();
        return new Promise(async (resolve, reject) => {
            const options = {
                worker: true,
                header: true,
                // --- Papa Parser by default will decide whether to use `fastMode` by itself.
                // --- Disable it to avoid random issues
                fastMode: false,
                skipEmptyLines: true,
                newline: overrideNewLine,
                trimHeader: true,
                // --- the `bind` is required here even for arrow function under worker mode
                chunk: (results: ParseResult<any>, parser: Parser) => {
                    try {
                        if (this.toBeAborted) {
                            parser.abort();
                            reject(
                                new Error("Data processing has been aborted.")
                            );
                            return;
                        }
                        if (
                            results.errors.length >= 1 &&
                            !results.data.length
                        ) {
                            // --- there are many reason that an error could be triggered
                            // --- we only stop processing when no any row can be processed from this chunk
                            reject(new Error(results.errors[0].message));
                            // --- stop further process
                            parser.abort();
                            return;
                        }
                        if (
                            results.data.length <= 1 &&
                            results.errors.length >= 1 &&
                            overrideNewLine !== "\n"
                        ) {
                            // A lot of CSV GEO AUs have an issue where papa can't detect the newline - try again with it overridden
                            this.skipComplete = true;
                            parser.abort();
                            console.log(
                                "retry CSV parsing with the different line ending setting..."
                            );
                            // --- worker may not abort immediately, retry later to avoid troubles
                            resolve(retryLater(this.load.bind(this, "\n")));
                        } else {
                            this.data = this.data.concat(results.data);
                            this.errors = this.errors.concat(results.errors);
                            if (!this.metaData) {
                                this.metaData = results.meta;
                            }
                        }
                    } catch (e) {
                        console.error(e);
                        reject(e);
                    }
                },
                complete: () => {
                    try {
                        if (this.skipComplete) {
                            this.skipComplete = false;
                            return;
                        }
                        const result = {
                            parseResult: {
                                data: this.data,
                                errors: this.errors,
                                meta: this.metaData as ParseMeta
                            }
                        };
                        this.resetDownloadData();
                        resolve(result);
                    } catch (e) {
                        reject(e);
                    }
                },
                error: (err) => {
                    reject(
                        err
                            ? err
                            : Error("Failed to retrieve or parse the file.")
                    );
                }
            };
            if (overrideNewLine) options["newline"] = overrideNewLine;
            Papa.parse(await csvRes.text(), options);
        });
    }
}

export default CsvDataLoader;

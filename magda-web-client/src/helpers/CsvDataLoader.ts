import { config } from "../config";
// --- as we only import types here, no runtime code will be emitted.
// --- And papaparse will not be included by the main js bundle
import { Parser, ParseResult, ParseError, ParseMeta } from "papaparse";
import { ParsedDistribution } from "./record";

export type DataLoadingResult = ParseResult;

type CsvUrlType = string;

type CsvSourceType = CsvUrlType | ParsedDistribution;

let Papa;

const getPapaParse = async () => {
    if (Papa) {
        Papa = await import(/* webpackChunkName: "papa" */ "papaparse");
    }
    return Papa;
};

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
    private maxChartProcessingRows: number;
    private maxTableProcessingRows: number;
    private maxProcessRows: number;

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
    private toBeAbort: boolean = false;

    constructor(source: CsvSourceType) {
        this.maxChartProcessingRows = config.maxChartProcessingRows;
        this.maxTableProcessingRows = config.maxTableProcessingRows;

        this.maxProcessRows = Math.max(
            this.maxChartProcessingRows,
            this.maxTableProcessingRows
        );

        this.url = this.getSourceUrl(source);
    }

    private getSourceUrl(source: CsvSourceType): string {
        if (typeof source === "string") {
            return source;
        }
        if (source.downloadURL) {
            return source.downloadURL;
        }
        if (source.accessURL) {
            return source.accessURL;
        }
        throw new Error(
            `Failed to determine CSV data source url for distribution id: ${
                source.identifier
            }`
        );
    }

    private resetDownloadData() {
        this.data = [];
        this.errors = [];
        this.metaData = null;
        this.isLoading = false;
        this.toBeAbort = false;
    }

    abort() {
        if (!this.isLoading) return;
        this.toBeAbort = true;
    }

    async load(overrideNewLine = ""): Promise<DataLoadingResult> {
        this.resetDownloadData();
        const Papa = await getPapaParse();
        const proxyUrl = config.proxyUrl + "_0d/" + this.url;
        return new Promise((resolve, reject) => {
            Papa.parse(proxyUrl, {
                worker: true,
                download: true,
                header: true,
                skipEmptyLines: true,
                newline: overrideNewLine,
                trimHeader: true,
                chunk: (results: ParseResult, parser: Parser) => {
                    try {
                        if (this.toBeAbort) {
                            parser.abort();
                            reject(
                                new Error("Data processing has been aborted.")
                            );
                            return;
                        }
                        if (
                            results.data.length <= 1 &&
                            results.errors.length >= 1 &&
                            overrideNewLine !== "\n"
                        ) {
                            // A lot of CSV GEO AUs have an issue where papa can't detect the newline - try again with it overridden
                            parser.abort();
                            // --- worker may not abort immediately, retry later to avoid troubles
                            resolve(retryLater(this.load.bind(this, "\n")));
                        } else if (results.errors.length >= 1) {
                            reject(new Error(results.errors[0].message));
                        } else {
                            this.data.push(results.data);
                            this.errors = results.errors;
                            if (!this.metaData) {
                                this.metaData = results.meta;
                            }
                            if (this.data.length >= this.maxProcessRows) {
                                // --- abort the download & parsing
                                parser.abort();
                                const result = {
                                    data: this.data,
                                    errors: this.errors,
                                    meta: this.metaData as ParseMeta
                                };
                                this.resetDownloadData();
                                resolve(result);
                            }
                        }
                    } catch (e) {
                        reject(e);
                    }
                },
                complete: () => {
                    try {
                        const result = {
                            data: this.data,
                            errors: this.errors,
                            meta: this.metaData as ParseMeta
                        };
                        this.resetDownloadData();
                        resolve(result);
                    } catch (e) {
                        reject(e);
                    }
                },
                error: err =>
                    reject(
                        err
                            ? err
                            : Error("Failed to retrieve or parse the file.")
                    )
            });
        });
    }
}

export default CsvDataLoader;

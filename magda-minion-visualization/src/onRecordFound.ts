import request from "magda-typescript-common/src/request";
import URI from "urijs";
import Papa from "papaparse";
import moment from "moment";
import { Readable } from "stream";

import Registry from "magda-typescript-common/src/registry/AuthorizedRegistryClient";
import retryBackoff from "magda-typescript-common/src/retryBackoff";

import { Record } from "magda-typescript-common/src/generated/registry/api";

const timeFormats = [
    moment.ISO_8601,
    "D-M-YYYY",
    "D/M/YYYY",
    "D/M/YY",
    "D-M-YY",
    "YYYY-[Q]Q"
];

export default function onRecordFound(
    record: Record,
    registry: Registry
): Promise<void> {
    const theTenantId = record.tenantId;

    const { downloadURL, format } = record.aspects["dcat-distribution-strings"];
    if (downloadURL && /csv/i.test(format)) {
        const parsedURL = new URI(downloadURL);
        if (
            parsedURL.protocol() === "http" ||
            parsedURL.protocol() === "https"
        ) {
            const operation: () => Promise<VisualizationInfo> = () =>
                new Promise((resolve, reject) => {
                    request
                        .get(downloadURL)
                        .on("error", reject)
                        .on("response", response => {
                            if (
                                response.statusCode >= 200 &&
                                response.statusCode <= 299
                            ) {
                                resolve(processCsv(record, response));
                            } else {
                                reject(
                                    new BadHttpResponseError(
                                        response.statusMessage,
                                        response.statusCode
                                    )
                                );
                            }
                        });
                });

            return retryBackoff(operation, 1, 5, (err, retries) => {
                console.log(
                    `Downloading ${downloadURL} failed: ${err.errorDetails ||
                        err.httpStatusCode ||
                        err} (${retries} retries remaining)`
                );
            })
                .then(async (visualizationInfo: VisualizationInfo) => {
                    await registry.putRecordAspect(
                        record.id,
                        "visualization-info",
                        visualizationInfo,
                        theTenantId
                    );
                })
                .catch(err => {
                    console.log(
                        `Failed to download ${downloadURL}: ${err.errorDetails ||
                            err.httpStatusCode ||
                            err}`
                    );
                });
        } else {
            console.log(`Unsupported URL: ${downloadURL}`);
        }
    }
    return undefined;
}

function processCsv(
    record: Record,
    stream: Readable
): Promise<VisualizationInfo> {
    // Currently only supports CSV:
    const fields: { [key: string]: Field } = {};
    let errorAbort: Boolean = false;

    return new Promise((resolve, reject) => {
        // @types/papaparse types doesn't recognise Node's stream.Readable (they want a browser ReadableStream)
        Papa.parse(<any>stream, {
            beforeFirstChunk(chunk) {
                // Test for binary data
                const badChars = chunk.match(/[\x00-\x08\x0E-\x1F]/g);
                if (badChars) {
                    // Flag as binary, then output an error message with up to the first 20 binary characters detected
                    errorAbort = true;
                    const badCharsStringified = badChars
                        .slice(0, 20)
                        .map(s => JSON.stringify(s))
                        .join(", "); // stringify to escape (and hence convert to printable representation) binary characters
                    console.log(
                        `Distribution "${record.id}" points to a binary file (binary characters detected: ${badCharsStringified})`
                    );
                    resolve({
                        format: "binary"
                    });
                }
            },
            complete() {
                if (!errorAbort) {
                    resolve({
                        format: "CSV",
                        wellFormed: true,
                        fields,
                        // At least one time and one numeric column
                        timeseries:
                            Object.keys(fields).some(key => fields[key].time) &&
                            Object.keys(fields).some(key => fields[key].numeric)
                    });
                }
            },
            dynamicTyping: true, // Replace this with proper number validation
            error(err) {
                errorAbort = true;
                console.log(err);
                resolve({
                    format: "CSV",
                    wellFormed: false
                });
            },
            header: true,
            skipEmptyLines: true,
            step(results, parser) {
                if (errorAbort) {
                    parser.abort();
                    return;
                }
                results.meta.fields.forEach(field => {
                    const values = results.data.map(row => row[field]);
                    if (!fields[field]) {
                        // First row. Set all attributes to true and modify that when a row doesn't validate
                        fields[field] = {
                            numeric: true,
                            time: true
                        };
                    }
                    if (
                        fields[field].numeric &&
                        !values.every(val => typeof val === "number")
                    ) {
                        // At least one row fails number validation. Not a great way to validate numbers
                        fields[field].numeric = false;
                    }
                    if (
                        fields[field].time &&
                        !values.every(time =>
                            moment(time, timeFormats, true).isValid()
                        )
                    ) {
                        fields[field].time = false;
                    }
                });
                if (
                    Object.keys(fields)
                        .map(field => fields[field])
                        .every(
                            fieldObj =>
                                fieldObj.time === false &&
                                fieldObj.numeric === false
                        )
                ) {
                    // Every attribute we're checking is already false, so short circuit and stop
                    parser.abort();
                }
            }
        });
    });
}

interface VisualizationInfo {
    format: string;
    wellFormed?: boolean;
    fields?: { [key: string]: Field };
    timeseries?: boolean;
}

class BadHttpResponseError extends Error {
    public httpStatusCode: number;

    constructor(message?: string, httpStatusCode?: number) {
        super(message);
        this.message = message;
        this.httpStatusCode = httpStatusCode;
        this.stack = new Error().stack;
    }
}

interface Field {
    numeric?: boolean;
    time?: boolean;
}

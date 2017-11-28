import * as request from 'request';
import * as URI from 'urijs';
import * as Papa from 'papaparse';
import * as moment from 'moment';

import Registry from "@magda/typescript-common/dist/registry/AuthorizedRegistryClient";
import retryBackoff from '@magda/typescript-common/dist/retryBackoff';

import { Record } from '@magda/typescript-common/dist/generated/registry/api';



const timeFormats = [moment.ISO_8601, 'DD/MM/YYYY', 'DD-MM-YYYY', 'YYYY-[Q]Q'];

export default function onRecordFound(record: Record, registry: Registry): Promise<void> {
    const { downloadURL, format } = record.aspects['dcat-distribution-strings'];
    if (downloadURL && /csv/i.test(format)) {
        const parsedURL = new URI(downloadURL);
        if (parsedURL.protocol() === 'http' || parsedURL.protocol() === 'https') {
            const operation = () => new Promise((resolve, reject) => request.get(downloadURL, (err: Error, response: request.RequestResponse, body: any) => {
                if (err) {
                    reject(err);
                } else {
                    if (response.statusCode >= 200 && response.statusCode <= 299) {
                        resolve({response, body});
                    } else {
                        reject(new BadHttpResponseError(response.statusMessage, response, response.statusCode));
                    }
                }
            }));
            return retryBackoff(operation, 1, 5, (err, retries) => {console.log(`Downloading ${downloadURL} failed: ${err.errorDetails || err.httpStatusCode || err} (${retries} retries remaining)`);})
                .then(({ response, body }) => {
                    return registry.putRecordAspect(record.id, 'visualization-info', processCsv(record, body)).then(() => {});
                }).catch(err => {
                    console.log(`Failed to download ${downloadURL}: ${err.errorDetails || err.httpStatusCode || err}`)
                });
        } else {
            console.log(`Unsupported URL: ${downloadURL}`);
        }
    }
    return undefined;
}

function processCsv(record: Record, body: any) : {format: string, wellFormed: boolean, fields?: {[key: string]: Field}, timeseries?: boolean} {
    // Currently only supports CSV:
    const parsed = Papa.parse(body, {
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true
    });
    let visualizationInfoAspect;
    if (parsed.errors.length === 0) {
        const fields: {[key: string]: Field} = {};
        parsed.meta.fields.forEach(field => {
            // Get column values
            const values = parsed.data.map(row => row[field]);
            // Try to detect the column type
            if (/^(.*[_ ])?(time|date)/i.test(field) && values.every(time => moment(time, timeFormats, true).isValid())) {
                // Check every value is a valid time
                fields[field] = {
                    time: true
                };
            } else if (values.every(val => typeof val === 'number')) {
                fields[field] = {
                    numeric: true
                };
            } else {
                fields[field] = {};
            }

        });
        visualizationInfoAspect = {
            format: 'CSV',
            wellFormed: true,
            fields,
            // At least one time and one numeric column
            //timeseries: Object.keys(fields).reduce((val, key) => val+(fields[key].time ? 1 : 0), 0) > 0 && Object.keys(fields).reduce((val, key) => val+(fields[key].numeric ? 1 : 0), 0) > 0
            timeseries: Object.keys(fields).some(key => fields[key].time) && Object.keys(fields).some(key => fields[key].numeric)
        };
        // function fieldType(field: Field): string {
        //     return field.numeric ? 'numeric' : field.time ? 'time' : 'text';
        // }
        // console.log('Parsed successfully with columns: ' + Object.keys(fields).map(key => `${key} (${fieldType(fields[key])})`).join(', '));
    } else {
        console.log(`${parsed.errors.length} errors in CSV, including: ` + (err => `Row: ${err.row} - ${err.code} (${err.message}), `)(parsed.errors[0]));
        visualizationInfoAspect = {
            format: 'CSV',
            wellFormed: false
        };
    }
    return visualizationInfoAspect;
}


class BadHttpResponseError extends Error  {
    public response: request.RequestResponse;
    public httpStatusCode: number;

    constructor(message?: string, response?: request.RequestResponse, httpStatusCode?: number) {
        super(message);
        this.message = message;
        this.response = response;
        this.httpStatusCode = httpStatusCode;
        this.stack = (new Error()).stack;
    }
}

interface Field {
    numeric?: boolean,
    time?: boolean
};

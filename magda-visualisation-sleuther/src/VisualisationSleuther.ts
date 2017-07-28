import * as request from 'request';
import * as URI from 'urijs';
import * as Baby from 'babyparse';
import * as moment from 'moment';

import Registry from '@magda/typescript-common/dist/Registry';
import retryBackoff from '@magda/typescript-common/dist/retryBackoff';
import AsyncPage, { forEachAsync } from '@magda/typescript-common/dist/AsyncPage';

import { Record } from '@magda/typescript-common/dist/generated/registry/api';

const aspectDefinition = {
    id: 'visualisation',
    name: 'Details about the downloadURL link status of a distribution',
    jsonSchema: require('@magda/registry-aspects/source-link-status.schema.json')
};

const timeFormats = [moment.ISO_8601, 'DD/MM/YYYY', 'DD-MM-YYYY', 'YYYY-[Q]Q'];

export default class VisualisationSleuther {
    private registry: Registry;

    constructor({ registry }: VisualisationSleutherOptions) {
        this.registry = registry;
    }
    async run(): Promise<VisualisationSleutherResult> {
        let checkedDistributions = 0;
        let csvs = 0;
        let timeseries = 0;

        await this.registry.putAspectDefinition(aspectDefinition);
        const registryPage = AsyncPage.create<{records: Array<Record>, nextPageToken: string}>((previous) => {
            if (previous === undefined) {
                return this.registry.getRecords(['dcat-distribution-strings']);
            } else if (previous.records.length === 0) {
                // Last page was an empty page, no more records left
                return undefined;
            } else {
                return this.registry.getRecords(['dcat-distribution-strings'], undefined, previous.nextPageToken, undefined);
            }
        }).map(page => page.records);

        await forEachAsync(registryPage, 20, record => {
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
                                throw new BadHttpResponseError(response.statusMessage, response, response.statusCode);
                            }
                        }
                    }));
                    return retryBackoff(operation, 1, 5, (err, retries) => {console.log(`Downloading ${downloadURL} failed: ${err.errorDetails || err.httpStatusCode || err} (${retries} retries remaining)`);})
                        .then(({ response, body }) => {
                            checkedDistributions++;
                            csvs++;
                            return this.processCsv(record, body, response).then(({timeseries : isTS}) => {
                                if (isTS) {
                                    timeseries++;
                                }
                            });
                        }).catch(err => {
                            checkedDistributions++;
                        });
                } else {
                    console.log(`Unsupported URL: ${downloadURL}`);
                }
            }
            return undefined;
        });
        return Promise.resolve({checkedDistributions, csvs, timeseries});
    }

    async processCsv(record: Record, body: any, httpResponse: request.RequestResponse) : Promise<{format: string, wellFormed: boolean, fields?: {[key: string]: Field}, timeseries?: boolean}> {
        // Currently only supports CSV:
        const parsed = Baby.parse(body, {
            header: true,
            dynamicTyping: true
        });
        let visualisationInfoAspect;
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
            visualisationInfoAspect = {
                format: 'CSV',
                wellFormed: true,
                fields,
                // At least one time and one numeric column
                timeseries: Object.keys(fields).reduce((val, key) => val+(fields[key].time ? 1 : 0), 0) > 0 && Object.keys(fields).reduce((val, key) => val+(fields[key].numeric ? 1 : 0), 0) > 0
            };
        } else {
            visualisationInfoAspect = {
                format: 'CSV',
                wellFormed: false
            };
        }
        await this.registry.putRecordAspect(record.id, 'visualisation-info', visualisationInfoAspect);
        return visualisationInfoAspect;
    }
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

interface VisualisationSleutherOptions {
    registry: Registry
}

interface VisualisationSleutherResult {
    checkedDistributions: number,
    csvs: number,
    timeseries: number
}

import * as request from 'request';
import * as URI from 'urijs';
import * as Baby from 'babyparse';
import Registry from '@magda/typescript-common/dist/Registry';
import retryBackoff from '@magda/typescript-common/dist/retryBackoff';
import AsyncPage, { forEachAsync } from '@magda/typescript-common/dist/AsyncPage';

import { Record } from '@magda/typescript-common/dist/generated/registry/api';

const aspectDefinition = {
    id: 'visualisation',
    name: 'Details about the downloadURL link status of a distribution',
    jsonSchema: require('@magda/registry-aspects/source-link-status.schema.json')
};

export default class VisualisationSleuther {
    private registry: Registry;

    constructor({ registry }: VisualisationSleutherOptions) {
        this.registry = registry;
    }
    async run(): Promise<VisualisationSleutherResult> {
        let checkedDistributions = 0;
        let brokenLinks = 0;
        let tooManyRequests = 0;

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
                                reject(new BadHttpResponseError(response.statusMessage, response, response.statusCode));
                            }
                        }
                    }));
                    return retryBackoff(operation, 1, 5, (err, retries) => {console.log(`Downloading ${downloadURL} failed: ${err.errorDetails || err.httpStatusCode || err} (${retries} retries remaining)`);})
                        .then(({ response, body }) => {
                            checkedDistributions++;
                            return this.processDistribution(record, body, response);
                        }).catch(err => {
                            checkedDistributions++;
                        });
                } else {
                    console.log(`Unsupported URL: ${downloadURL}`);
                    return this.registry.putRecordAspect(record.id, 'source-link-status', {status: 'broken', errorDetails: `Unrecognised URL: ${downloadURL}`}).then(() => {});
                }
            }
            return undefined;
        });
        return Promise.resolve({checkedDistributions, brokenLinks, tooManyRequests});
    }

    async processDistribution(record: Record, body: any, httpResponse: request.RequestResponse) {
        // Currently only supports CSV:
        const parsed = Baby.parse(body, {
            header: true,
            dynamicTyping: true
        });
        if (parsed.errors.length === 0) {
            const fields: {[key: string]: {numeric?: boolean}} = {};
            parsed.meta.fields.forEach(field => {
                const values = parsed.data.map(row => row[field]);
                // Try to detect the column type
                if (values.every(val => typeof val === 'number')) {
                    fields[field] = {
                        numeric: true
                    };
                    return;
                }
                if (/^(.*[_ ])?(time|date)/i.test(field)) {
                    // Could be date or time column
                    values.every(time => )
                }

            });
            const visualisationInfoAspect = {
                format: 'CSV',
                wellFormed: true,
                fields
            };
            await this.registry.putRecordAspect(record.id, 'visualisation-info', visualisationInfoAspect);
        } else {
            await this.registry.putRecordAspect(record.id, 'visualisation-info', {
                format: 'CSV',
                wellFormed: false
            });
        }
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


interface VisualisationSleutherOptions {
    registry: Registry
}

interface VisualisationSleutherResult {
    checkedDistributions: number,
    brokenLinks: number,
    tooManyRequests: number
}

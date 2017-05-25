import Registry from '@magda/typescript-common/lib/Registry';
import * as request from 'request';
import * as http from 'http';
import retryBackoff from '@magda/typescript-common/lib/retryBackoff';
import formatServiceError from '@magda/typescript-common/lib/formatServiceError';

const aspectDefinition = {
    id: 'source-link-status',
    name: 'Details about the downloadURL link status of a distribution',
    jsonSchema: require('@magda/registry-aspects/source-link-status.schema.json')
};


export default class BrokenLinkSleuther {
    private registry: Registry;
    constructor({ registry }: BrokenLinkSleutherOptions) {
        this.registry = registry;
    }
    async run(): Promise<BrokenLinkSleutherResult> {
        let checkedDistributions = 0;
        let brokenLinks = 0;
        let tooManyRequests = 0;

        await this.registry.putAspectDefinition(aspectDefinition);

        await this.registry.forEachRecord(record => {
            if (record.aspects['dcat-distribution-strings'].downloadURL) {
                const operation = () => new Promise((resolve, reject) => request.head(record.aspects['dcat-distribution-strings'].downloadURL, (err: Error, response: http.IncomingMessage) => {
                    if (err) {
                        reject(err);
                    } else {
                        if (response.statusCode >= 200 && response.statusCode <= 299) {
                            resolve({ response });
                        } else {
                            reject({
                                response,
                                httpStatusCode: response.statusCode,
                                errorDetails: response.statusMessage
                            });
                        }
                    }
                }));
                return retryBackoff(operation, 10, 4, (err, retries) => {console.log(`${err.errorDetails || err.httpStatusCode || err}`);})
                .then(({response}) => {
                    checkedDistributions++;
                    return {status: 'active', httpStatusCode: response.statusCode}
                }, err => {
                    checkedDistributions++;
                    if (err.httpStatusCode == 429) {
                        tooManyRequests++
                    } else {
                        brokenLinks++;
                    }
                    return {
                        status: 'broken',
                        httpStatusCode: err.httpStatusCode,
                        errorDetails: err.errorDetails || `${err}`
                    }
                })
                .then(aspect => this.registry.putRecordAspect(record.id, 'source-link-status', aspect))
                .then(() => {
                    if (checkedDistributions % 100 === 0) {
                        console.log(`Processed ${checkedDistributions}. ${brokenLinks} broken links & ${tooManyRequests} failed with 429 status code`);
                    }
                });
            }
        }, <any>'dcat-distribution-strings');
        return Promise.resolve({checkedDistributions, brokenLinks, tooManyRequests});
    }
}

// Check broken links for ftp:
/*
const Client = require("ftp")
const c = Client();

const host = 'ftp2.bom.gov.au';
const path = 'anon/gen/fwo/IDQ11295.xml';

const p = new Promise((resolve, reject) => {
    c.on('ready', function() {
        console.log('Server ready');
        c.get(path, (err, stream) => {
            if (err) {
                c.abort(() => reject(err));
            } else {
                console.log('Resource available');
                c.abort(() => resolve());
            }
        });
    });
    setTimeout(() => {c.destroy(); reject(new Error('Timeout'))}, 60000); // 15 seconds is too short
});

c.connect({
    host
});
*/

interface BrokenLinkSleutherOptions {
    registry: Registry
}

interface BrokenLinkSleutherResult {
    checkedDistributions: number,
    brokenLinks: number,
    tooManyRequests: number
}

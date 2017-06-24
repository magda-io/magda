import Registry from '@magda/typescript-common/dist/Registry';
import * as request from 'request';
import * as http from 'http';
import * as Client from 'ftp';
import * as LRU from 'lru-cache';
import * as URI from 'urijs';
import retryBackoff from '@magda/typescript-common/dist/retryBackoff';
import AsyncPage, { forEachAsync } from '@magda/typescript-common/dist/AsyncPage';

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


        const registryPage = AsyncPage.create<{records: Array<{id: string, aspects: {'dcat-distribution-strings': {downloadURL: string}}}>, nextPageToken: string}>((previous) => {
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
            const url = record.aspects['dcat-distribution-strings'].downloadURL;
            if (url) {
                const parsedURL = new URI(url);
                if (parsedURL.protocol() === 'http' || parsedURL.protocol() === 'https') {
                    const operation = () => new Promise((resolve, reject) => request.head(url, (err: Error, response: http.IncomingMessage) => {
                        if (err) {
                            reject(err);
                        } else {
                            if (response.statusCode >= 200 && response.statusCode <= 299) {
                                resolve({ response });
                            } else {
                                reject(new BadHttpResponseError(response.statusMessage, response, response.statusCode));
                            }
                        }
                    }));
                    return retryBackoff(operation, 1, 5, (err, retries) => {console.log(`Downloading ${url} failed: ${err.errorDetails || err.httpStatusCode || err} (${retries} retries remaining)`);})
                        .then(({response}) => {
                            checkedDistributions++;
                            return {status: 'active', httpStatusCode: response.statusCode};
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
                            };
                        })
                        .then(aspect => this.registry.putRecordAspect(record.id, 'source-link-status', aspect))
                        .then(() => {
                            if (checkedDistributions % 100 === 0) {
                                console.log(`Processed ${checkedDistributions}. ${brokenLinks} broken links & ${tooManyRequests} failed with 429 status code`);
                            }
                        });
                } else if (parsedURL.protocol() === 'ftp') {
                    const port = +(parsedURL.port() || 21)
                    const pClient = FTPHandler.getClient(parsedURL.hostname(), port);
                    return pClient.then(client => {
                        return new Promise((resolve, reject) => {
                            client.list(parsedURL.path(), (err, list) => {
                                if (err) {
                                    reject(err);
                                } else if (list.length === 0) {
                                    reject(new Error(`File "${url}" not found`));
                                } else {
                                    resolve(list[0]);
                                }
                            });
                        });
                    }).then(() => {
                        checkedDistributions++;
                        return {status: 'active'};
                    }, err => {
                        checkedDistributions++;
                        brokenLinks++;
                        console.log(`${err}`);
                        return {status: 'broken', errorDetails: `${err}`};
                    }).then(aspect => {this.registry.putRecordAspect(record.id, 'source-link-status', aspect);});
                } else {
                    console.log(`Unrecognised URL: ${url}`);
                    return this.registry.putRecordAspect(record.id, 'source-link-status', {status: 'broken', errorDetails: `Unrecognised URL: ${url}`}).then(() => {});
                }
            }
            return undefined;
        });

        FTPHandler.lru.reset();
        return Promise.resolve({checkedDistributions, brokenLinks, tooManyRequests});
    }
}

class BadHttpResponseError extends Error  {
    public response: http.IncomingMessage;
    public httpStatusCode: number;

    constructor(message?: string, response?: http.IncomingMessage, httpStatusCode?: number) {
        super(message);
        this.message = message;
        this.response = response;
        this.httpStatusCode = httpStatusCode;
        this.stack = (new Error()).stack;
    }
}

namespace FTPHandler {
    export const lru = LRU<Promise<Client>>({
        max: 20,
        dispose(key, pClient) {
            pClient.then(client => client.end());
        }
    });

    export function getClient(host: string, port: number) {
        let pClient = lru.get(`${host}:${port}`);
        if (pClient) {
            return pClient;
        } else {
            const client = new Client();
            let fulfilled = false;
            pClient = new Promise((resolve, reject) => {
                client.on('ready', () => {
                    fulfilled = true;
                    resolve(client);
                });
                client.on('error', (err: Error) => {
                    if (!fulfilled) {
                        console.log(err);
                        client.destroy();
                        reject(err);
                        fulfilled = true;
                    }
                });
            });
            console.log(`Attempting to connect to host: ${host}, port: ${port}`);
            client.connect({
                host,
                port
            });
            lru.set(`${host}:${port}`, pClient);
            return pClient;
        }
    }


}

interface BrokenLinkSleutherOptions {
    registry: Registry
}

interface BrokenLinkSleutherResult {
    checkedDistributions: number,
    brokenLinks: number,
    tooManyRequests: number
}

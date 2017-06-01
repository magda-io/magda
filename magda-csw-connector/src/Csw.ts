import { IConnectorSource } from '@magda/typescript-common/lib/JsonConnector';
import * as URI from 'urijs';
import * as request from 'request';
import AsyncPage from '@magda/typescript-common/lib/AsyncPage';
import retry from '@magda/typescript-common/lib/retry';
import * as xml2js from 'xml2js';
import formatServiceError from '@magda/typescript-common/lib/formatServiceError';

export default class Csw implements IConnectorSource {
    public readonly baseUrl: uri.URI;
    public readonly name: string;
    public readonly parameters: object;
    public readonly pageSize: number;
    public readonly maxRetries: number;
    public readonly secondsBetweenRetries: number;

    public static readonly defaultGetRecordsParameters = Object.freeze({
        service: 'CSW',
        version: '2.0.2',
        request: 'GetRecords',
        constraintLanguage: 'FILTER',
        resultType: 'results',
        elementsetname: 'full',
        outputschema: 'http://www.isotc211.org/2005/gmd',
        typeNames: 'gmd:MD_Metadata'
    });

    constructor(options: CswOptions) {
        this.baseUrl = new URI(options.baseUrl);
        this.name = options.name;
        this.parameters = Object.assign({}, options.parameters);
        this.pageSize = options.pageSize || 10;
        this.maxRetries = options.maxRetries || 10;
        this.secondsBetweenRetries = options.secondsBetweenRetries || 10;
    }

    getRecords(): AsyncPage<CswGmdResponse> {
        const parameters = Object.assign({}, Csw.defaultGetRecordsParameters, this.parameters);
        const url = this.baseUrl.clone().addSearch(parameters);

        let startIndex = 0;

        return AsyncPage.create<CswGmdResponse>(previous => {
            if (previous) {
                console.dir(previous);
                // startIndex += previous.result.results.length;
                // if (startIndex >= previous.result.count) {
                //     return undefined;
                // }
            }

            return this.requestRecordsPage(url, startIndex);
        });
    }

    private requestRecordsPage(url: uri.URI, startIndex: number): Promise<CswGmdResponse> {
        const pageUrl = url.clone();
        pageUrl.addSearch('startPosition', startIndex + 1);
        pageUrl.addSearch('maxRecords', this.pageSize);

        const operation = () => new Promise<CswGmdResponse>((resolve, reject) => {
            console.log('Requesting ' + pageUrl.toString());
            request(pageUrl.toString(), {}, (error, response, body) => {
                if (error) {
                    reject(error);
                    return;
                }
                console.log('Received@' + startIndex);
                const xml2jsany: any = xml2js;
                const parser = new xml2js.Parser({
                    xmlns: true,
                    tagNameProcessors: [ xml2jsany.processors.stripPrefix ]
                });
                parser.parseString(body, function(error: any, result: any) {
                    if (error) {
                        reject(error);
                        return;
                    }
                    resolve(result);
                });
            });
        });

        return retry(operation, this.secondsBetweenRetries, this.maxRetries, (e, retriesLeft) => console.log(formatServiceError(`Failed to GET ${pageUrl.toString()}.`, e, retriesLeft)));
    }
}

export interface CswOptions {
    baseUrl: string;
    name: string;
    parameters?: object;
    pageSize?: number;
    maxRetries?: number;
    secondsBetweenRetries?: number;
}

export interface CswGmdResponse {

}

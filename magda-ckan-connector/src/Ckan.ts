import AsyncPage from '@magda/typescript-common/dist/AsyncPage';
import CkanUrlBuilder from './CkanUrlBuilder';
import formatServiceError from '@magda/typescript-common/dist/formatServiceError';
import { IConnectorSource } from '@magda/typescript-common/dist/JsonConnector';
import retry from '@magda/typescript-common/dist/retry';
import * as request from 'request';
import * as URI from 'urijs';

export interface CkanThing {
    id: string;
    name: string;
    [propName: string]: any;
}

export interface CkanResource extends CkanThing {
}

export interface CkanDataset extends CkanThing {
    resources: CkanResource[];
}

export interface CkanOrganization extends CkanThing {
}

export interface CkanPackageSearchResponse {
    result: CkanPackageSearchResult;
    [propName: string]: any;
}

export interface CkanPackageSearchResult {
    count: number;
    results: CkanDataset[];
    [propName: string]: any;
}

export interface CkanOrganizationListResponse {
    result: CkanOrganization[];
    [propName: string]: any;
}

export interface CkanOptions {
    baseUrl: string;
    name: string;
    apiBaseUrl?: string;
    pageSize?: number;
    maxRetries?: number;
    secondsBetweenRetries?: number;
    ignoreHarvestSources?: string[];
}

export default class Ckan implements IConnectorSource {
    public readonly name: string;
    public readonly pageSize: number;
    public readonly maxRetries: number;
    public readonly secondsBetweenRetries: number;
    public readonly urlBuilder: CkanUrlBuilder;
    private ignoreHarvestSources: string[];

    constructor({
        baseUrl,
        name,
        apiBaseUrl,
        pageSize = 1000,
        maxRetries = 10,
        secondsBetweenRetries = 10,
        ignoreHarvestSources = []
    }: CkanOptions) {
        this.name = name;
        this.pageSize = pageSize;
        this.maxRetries = maxRetries;
        this.secondsBetweenRetries = secondsBetweenRetries;
        this.urlBuilder = new CkanUrlBuilder({
            name: name,
            baseUrl,
            apiBaseUrl
        });
    }

    public packageSearch(options?: {
        ignoreHarvestSources?: string[];
    }): AsyncPage<CkanPackageSearchResponse> {
        const url = new URI(this.urlBuilder.getPackageSearchUrl());

        let fqComponent = '';
        if (options && options.ignoreHarvestSources && options.ignoreHarvestSources.length > 0) {
            const solrQueries = options.ignoreHarvestSources.map(title => {
                const encoded = title === '*' ? title : encodeURIComponent('"' + title + '"');
                return `-harvest_source_title:${encoded}`
            });
            fqComponent = '&fq=' + solrQueries.join('+');
        }

        url.addSearch('sort', 'metadata_created asc');

        let startIndex = 0;

        return AsyncPage.create<CkanPackageSearchResponse>(previous => {
            if (previous) {
                startIndex += previous.result.results.length;
                if (startIndex >= previous.result.count) {
                    return undefined;
                }
            }

            return this.requestPackageSearchPage(url, fqComponent, startIndex);
        });
    }

    public organizationList(): AsyncPage<CkanOrganizationListResponse> {
        const url = new URI(this.urlBuilder.getOrganizationListUrl()).addSearch('all_fields', 'true');

        let startIndex = 0;
        return AsyncPage.create<CkanOrganizationListResponse>(previous => {
            if (previous) {
                if (previous.result.length === 0) {
                    return undefined;
                }
                startIndex += previous.result.length;
            }

            return this.requestOrganizationListPage(url, startIndex, previous);
        });
    }

    public getJsonOrganizations(): AsyncPage<object[]> {
        const organizationPages = this.organizationList();
        return organizationPages.map((organizationPage) => organizationPage.result);
    }

    public getJsonDatasets(): AsyncPage<object[]> {
        const packagePages = this.packageSearch({
            ignoreHarvestSources: this.ignoreHarvestSources
        });
        return packagePages.map((packagePage) => packagePage.result.results);
    }

    public getJsonDistributions(dataset: any): AsyncPage<object[]> {
        return AsyncPage.single<object[]>(dataset.resources || []);
    }

    private requestPackageSearchPage(url: uri.URI, fqComponent: string, startIndex: number): Promise<CkanPackageSearchResponse> {
        const pageUrl = url.clone();
        pageUrl.addSearch('start', startIndex);
        pageUrl.addSearch('rows', this.pageSize);

        const operation = () => new Promise<CkanPackageSearchResponse>((resolve, reject) => {
            const requestUrl = pageUrl.toString() + fqComponent;
            console.log('Requesting ' + requestUrl);
            request(requestUrl, { json: true }, (error, response, body) => {
                if (error) {
                    reject(error);
                    return;
                }
                console.log('Received@' + startIndex);
                resolve(body);
            });
        });

        return retry(operation, this.secondsBetweenRetries, this.maxRetries, (e, retriesLeft) => console.log(formatServiceError(`Failed to GET ${pageUrl.toString()}.`, e, retriesLeft)));
    }

    private requestOrganizationListPage(
        url: uri.URI,
        startIndex: number,
        previous: CkanOrganizationListResponse): Promise<CkanOrganizationListResponse> {

        const pageUrl = url.clone();
        pageUrl.addSearch('offset', startIndex);
        pageUrl.addSearch('limit', this.pageSize);

        const operation = () => new Promise<CkanOrganizationListResponse>((resolve, reject) => {
            console.log('Requesting ' + pageUrl.toString());
            request(pageUrl.toString(), { json: true }, (error, response, body) => {
                if (error) {
                    reject(error);
                    return;
                }
                console.log('Received@' + startIndex);

                // Older versions of CKAN ignore the offset and limit parameters and just return all orgs.
                // To avoid paging forever in that scenario, we check if this page is identical to the last one
                // and ignore the items if so.
                if (previous && body &&
                    previous.result && body.result &&
                    previous.result.length === body.result.length &&
                    JSON.stringify(previous.result) === JSON.stringify(body.result)) {

                    body.result.length = 0;
                }

                resolve(body);
            });
        });

        return retry(operation, this.secondsBetweenRetries, this.maxRetries, (e, retriesLeft) => console.log(formatServiceError(`Failed to GET ${pageUrl.toString()}.`, e, retriesLeft)));
    }
}

import AsyncPage from '@magda/typescript-common/dist/AsyncPage';
import formatServiceError from '@magda/typescript-common/dist/formatServiceError';
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
}

export default class Ckan {
    public readonly baseUrl: uri.URI;
    public readonly name: string;
    public readonly apiBaseUrl: uri.URI;
    public readonly pageSize: number;
    public readonly maxRetries: number;
    public readonly secondsBetweenRetries: number;

    constructor({
        baseUrl,
        name,
        apiBaseUrl = baseUrl,
        pageSize = 1000,
        maxRetries = 10,
        secondsBetweenRetries = 10
    }: CkanOptions) {
        this.baseUrl = new URI(baseUrl);
        this.name = name;
        this.apiBaseUrl = new URI(apiBaseUrl);
        this.pageSize = pageSize;
        this.maxRetries = maxRetries;
        this.secondsBetweenRetries = secondsBetweenRetries;
    }

    public packageSearch(options?: {
        ignoreHarvestSources?: string[];
    }): AsyncPage<CkanPackageSearchResponse> {
        const url = this.apiBaseUrl.clone().segment('api/3/action/package_search');

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
        const url = this.apiBaseUrl.clone().segment('api/3/action/organization_list').addSearch('all_fields', 'true');

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

    public getPackageShowUrl(id: string): string {
        return this.apiBaseUrl.clone().segment('api/3/action/package_show').addSearch('id', id).toString();
    }

    public getResourceShowUrl(id: string): string {
        return this.apiBaseUrl.clone().segment('api/3/action/resource_show').addSearch('id', id).toString();
    }

    public getOrganizationShowUrl(id: string): string {
        return this.apiBaseUrl.clone().segment('api/3/action/organization_show').addSearch('id', id).toString();
    }

    public getDatasetLandingPageUrl(id: string): string {
        return this.baseUrl.clone().segment('dataset').segment(id).toString();
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

import { Observable } from 'rx';
import * as URI from 'urijs';
import * as request from 'request';
import retry from './retry';
import formatServiceError from './formatServiceError';

export interface CkanDataset {
    id: string;
    name: string;
    title: string;
    description: string;
    [propName: string]: any;
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

export interface CkanOptions {
    baseUrl: string,
    apiBaseUrl?: string,
    pageSize?: number
}

export default class Ckan {
    public readonly baseUrl: uri.URI;
    public readonly apiBaseUrl: uri.URI;
    public readonly pageSize: number;

    constructor({
        baseUrl,
        apiBaseUrl = baseUrl,
        pageSize = 1000
    }: CkanOptions) {
        this.baseUrl = new URI(baseUrl);
        this.apiBaseUrl = new URI(apiBaseUrl);
        this.pageSize = pageSize;
    }

    public packageSearch(options?: {
        ignoreHarvestSources?: string[];
    }): Observable<CkanDataset> {
        const url = this.apiBaseUrl.clone().segment('api/3/action/package_search');
        
        if (options && options.ignoreHarvestSources && options.ignoreHarvestSources.length > 0) {
            const solrQueries = options.ignoreHarvestSources.map(title => `-harvest_source_title:${encodeURIComponent(title)}`);
            url.addSearch('fq', solrQueries.join('+'));
        }

        return this.fetchPackageSearch(url, 0);
    }

    public getPackageShowUrl(id: string): string {
        return this.apiBaseUrl.clone().segment('api/3/action/package_show').addSearch('id', id).toString();
    }

    public getDatasetLandingPageUrl(id: string): string {
        return this.baseUrl.clone().segment('dataset').segment(id).toString();
    }

    private fetchPackageSearch(url: uri.URI, startIndex: number): Observable<CkanDataset> {
        return this.requestPackageSearchPage(url, startIndex).flatMap(packageSearchResponse => {
            const items = Observable.fromArray(packageSearchResponse.result.results);
            const nextStartIndex = startIndex + this.pageSize;
            const nextPage = packageSearchResponse.result.count > nextStartIndex
                ? this.fetchPackageSearch(url, nextStartIndex)
                : Observable.empty<CkanDataset>();
            return Observable.concat(items, nextPage);
        });
    }

    private requestPackageSearchPage(url: uri.URI, startIndex: number): Observable<CkanPackageSearchResponse> {
        const pageUrl = url.clone();
        pageUrl.addSearch('start', startIndex);
        pageUrl.addSearch('rows', this.pageSize);

        const operation = () => new Promise<CkanPackageSearchResponse>((resolve, reject) => {
            request(pageUrl.toString(), { json: true }, (error, response, body) => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve(body);
            });
        });

        const promise = retry(operation, 10, 10, (e, retriesLeft) => console.log(formatServiceError(`Failed to GET ${pageUrl.toString()}.`, e, retriesLeft)));

        return Observable.fromPromise(promise);
    }
}

import { Observable } from 'rx'
import * as URI from 'urijs'
import * as request from 'request'

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

export default class Ckan {
    public readonly baseUrl: uri.URI;
    public readonly pageSize: number;

    constructor({
        baseUrl,
        pageSize = 1000
    }) {
        this.baseUrl = new URI(baseUrl);
        this.pageSize = pageSize;
    }

    public packageSearch(options?: {
        ignoreHarvestSources?: string[];
    }): Observable<CkanDataset> {
        const url = this.baseUrl.clone().segment('api/3/action/package_search');
        
        if (options && options.ignoreHarvestSources && options.ignoreHarvestSources.length > 0) {
            const solrQueries = options.ignoreHarvestSources.map(title => `-harvest_source_title:${encodeURIComponent(title)}`);
            url.addSearch('fq', solrQueries.join('+'));
        }

        return this.fetchPackageSearch(url, 0);
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

        const promise = new Promise<CkanPackageSearchResponse>((resolve, reject) => {
            request(pageUrl.toString(), { json: true }, (error, response, body) => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve(body);
            });
        });

        return Observable.fromPromise(promise);
    }
}

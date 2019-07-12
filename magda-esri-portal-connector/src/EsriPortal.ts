import AsyncPage from "@magda/typescript-common/dist/AsyncPage";
import EsriPortalUrlBuilder from "./EsriPortalUrlBuilder";
import formatServiceError from "@magda/typescript-common/dist/formatServiceError";
import { ConnectorSource } from "@magda/typescript-common/dist/JsonConnector";
import retry from "@magda/typescript-common/dist/retry";
import request from "@magda/typescript-common/dist/request";
import * as URI from "urijs";

export interface EsriPortalThing {
    id: string;
    name: string;
    [propName: string]: any;
}

export interface EsriPortalResource extends EsriPortalThing {}

export interface EsriPortalDataset extends EsriPortalThing {
    resources: EsriPortalResource[];
}

export interface EsriPortalOrganization extends EsriPortalThing {}

export interface EsriPortalDataSearchResponse {
    result: EsriPortalDataSearchResult;
    [propName: string]: any;
}

export interface EsriPortalDataSearchResult {
    count: number;
    results: EsriPortalDataset[];
    [propName: string]: any;
}

export interface EsriPortalOrganizationListResponse {
    result: EsriPortalOrganization[];
    [propName: string]: any;
}

export interface EsriPortalOptions {
    baseUrl: string;
    id: string;
    name: string;
    pageSize?: number;
    maxRetries?: number;
    secondsBetweenRetries?: number;
}

export default class EsriPortal implements ConnectorSource {
    public readonly id: string;
    public readonly name: string;
    public readonly pageSize: number;
    public readonly maxRetries: number;
    public readonly secondsBetweenRetries: number;
    public readonly urlBuilder: EsriPortalUrlBuilder;
    public readonly hasFirstClassOrganizations: boolean = false;

    constructor({
        baseUrl,
        id,
        name,
        pageSize = 1000,
        maxRetries = 10,
        secondsBetweenRetries = 10
    }: EsriPortalOptions) {
        this.id = id;
        this.name = name;
        this.pageSize = pageSize;
        this.maxRetries = maxRetries;
        this.secondsBetweenRetries = secondsBetweenRetries;
        this.urlBuilder = new EsriPortalUrlBuilder({
            id: id,
            name: name,
            baseUrl
        });
    }

    private packageSearch(options?: {
        start?: number;
        title?: string;
    }): AsyncPage<EsriPortalDataSearchResponse> {
        const url = new URI(this.urlBuilder.getDataSearchUrl());

        const startStart = options.start || 0;
        let startIndex = startStart;

        return AsyncPage.create<EsriPortalDataSearchResponse>(previous => {
            // console.log(previous)
            if (previous) {
                startIndex = previous.nextStart;
                if (previous.nextStart === -1) return undefined;
            }
            return this.requestDataSearchPage(url, startIndex);
        });
    }

    public getJsonDatasets(): AsyncPage<any[]> {
        const packagePages = this.packageSearch({});
        return packagePages.map(function(packagePage) {
            return packagePage.results;
        });
    }

    public getJsonDataset(id: string): Promise<any> {
        const url = this.urlBuilder.getContentItemUrl(id);

        return new Promise<any>((resolve, reject) => {
            request(url, { json: true }, (error, response, body) => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve(body.result);
            });
        });
    }

    public getJsonDistributions(dataset: any): AsyncPage<any[]> {
        return AsyncPage.single<object[]>(dataset.distributions || []);
    }

    public searchDatasetsByTitle(
        title: string,
        maxResults: number
    ): AsyncPage<any[]> {
        return undefined;
    }

    public getJsonFirstClassOrganizations(): AsyncPage<any[]> {
        return undefined;
    }

    public getJsonFirstClassOrganization(id: string): Promise<any> {
        return undefined;
    }

    public searchFirstClassOrganizationsByTitle(
        title: string,
        maxResults: number
    ): AsyncPage<any[]> {
        return undefined;
    }

    public getJsonDatasetPublisherId(dataset: any): string {
        return undefined;
    }

    getJsonDatasetPublisher(dataset: any): Promise<any> {
        return undefined;
    }

    private requestDistributionInformation(
        distributionUrl: string
    ): Promise<any> {
        const jsonDistUrl = this.urlBuilder.getResource(distributionUrl);
        return new Promise<any>((resolve, reject) => {
            request(jsonDistUrl, { json: true }, (error, response, body) => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve(body);
            });
        });
    }

    private requestDataSearchPage(
        url: uri.URI,
        startIndex: number
    ): Promise<EsriPortalDataSearchResponse> {
        const pageUrl = url.clone();
        pageUrl.addSearch("start", startIndex);
        pageUrl.addSearch("num", this.pageSize);
        const that = this;
        const operation = () =>
            new Promise<EsriPortalDataSearchResponse>((resolve, reject) => {
                const requestUrl = pageUrl.toString();
                console.log("Requesting " + requestUrl);
                request(requestUrl, { json: true }, (error, response, body) => {
                    if (error) {
                        reject(error);
                        return;
                    }
                    const distributionPromises: any = [];
                    body.results.forEach(function(item: any) {
                        distributionPromises.push(
                            that.requestDistributionInformation(item.url)
                        );
                    }, this);

                    Promise.all(distributionPromises).then(values => {
                        body.results.forEach(function(
                            item: any,
                            index: number
                        ) {
                            const distForDataset: any = values[index];
                            distForDataset.id = `${item.id}-0`;
                            item.distributions = [distForDataset];
                        },
                        this);
                        resolve(body);
                    });
                    // console.log("Received@",  body);
                });
            });

        return retry(
            operation,
            this.secondsBetweenRetries,
            this.maxRetries,
            (e, retriesLeft) =>
                console.log(
                    formatServiceError(
                        `Failed to GET ${pageUrl.toString()}.`,
                        e,
                        retriesLeft
                    )
                )
        );
    }
}

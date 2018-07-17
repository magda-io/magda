import AsyncPage from "@magda/typescript-common/dist/AsyncPage";
import DapUrlBuilder from "./DapUrlBuilder";
import formatServiceError from "@magda/typescript-common/dist/formatServiceError";
import { ConnectorSource } from "@magda/typescript-common/dist/JsonConnector";
import retry from "@magda/typescript-common/dist/retry";
import * as request from "request";
import * as URI from "urijs";

export interface DapThing {
    id: string;
    name: string;
    [propName: string]: any;
}

export interface DapResource extends DapThing {}

export interface DapDataset extends DapThing {
    resources: DapResource[];
}

export interface DapOrganization extends DapThing {}

export interface DapPackageSearchResponse {
    result: DapPackageSearchResult;
    [propName: string]: any;
}

export interface DapPackageSearchResult {
    count: number;
    results: DapDataset[];
    [propName: string]: any;
}
export interface DapDistribution {
    distributions: object[];
}

export interface DapOrganizationListResponse {
    result: DapOrganization[];
    [propName: string]: any;
}

export interface DapOptions {
    baseUrl: string;
    id: string;
    name: string;
    apiBaseUrl?: string;
    pageSize?: number;
    distributionSize?: number;
    maxRetries?: number;
    secondsBetweenRetries?: number;
    ignoreHarvestSources?: string[];
}

export default class Dap implements ConnectorSource {
    public readonly id: string;
    public readonly name: string;
    public readonly pageSize: number;
    public readonly distributionSize: number;
    public readonly maxRetries: number;
    public readonly secondsBetweenRetries: number;
    public readonly urlBuilder: DapUrlBuilder;
    private ignoreHarvestSources: string[];
    readonly hasFirstClassOrganizations: boolean = true;
    constructor({
        baseUrl,
        id,
        name,
        apiBaseUrl,
        pageSize = 1000,
        distributionSize = 24,
        maxRetries = 10,
        secondsBetweenRetries = 10,
        ignoreHarvestSources = []
    }: DapOptions) {
        this.id = id;
        this.name = name;
        this.pageSize = pageSize;
        this.distributionSize = distributionSize;
        this.maxRetries = maxRetries;
        this.secondsBetweenRetries = secondsBetweenRetries;
        this.ignoreHarvestSources = ignoreHarvestSources;
        this.urlBuilder = new DapUrlBuilder({
            id: id,
            name: name,
            baseUrl,
            apiBaseUrl
        });
    }
    // DAP data source contains only one organization CSIRO, so leave a static organization description here.
    private organization = {
        name:
            "The Commonwealth Scientific and Industrial Research Organisation",
        identifier: "CSIRO",
        title:
            "The Commonwealth Scientific and Industrial Research Organisation",
        description: `The Commonwealth Scientific and Industrial Research Organisation (CSIRO) is Australia's national science agency and one of the largest and most diverse research agencies in the world. The CSIRO Data Access Portal provides access to research data, software and other digital assets published by CSIRO across a range of disciplines. The portal is maintained by CSIRO Information Management & Technology to facilitate sharing and reuse.`,
        imageUrl:
            "https://data.csiro.au/dap/resources-2.6.6/images/csiro_logo.png",
        phone: "1300 363 400",
        email: "CSIROEnquiries@csiro.au",
        website: "https://data.csiro.au/"
    };

    public getJsonDatasets(): AsyncPage<any[]> {
        const packagePages = this.packageSearch({
            ignoreHarvestSources: this.ignoreHarvestSources
        });
        return packagePages.map(packagePage => {
            if (packagePage) {
                // return packagePage.dataCollections
                return packagePage.detailDataCollections;
            }
        });
    }

    public getJsonDataset(id: string): Promise<any> {
        const url = this.urlBuilder.getPackageShowUrl(id);
        return new Promise<any>((resolve, reject) => {
            request(url, { json: true }, (error, response, body) => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve(body);
            });
        });
    }
    public getJsonDistributions(dataset: any): AsyncPage<object[]> {
        // dataset of dataCollection from DAP /collections api does not contain a 'data' field, which defines the dirstributions
        // Herr use an api call (/collections/id) to get the dataset with the field 'data', and then fetch
        // return AsyncPage.single<object[]>(dataset.summarizedDistribution || [])
        return AsyncPage.singlePromise<DapDistribution[]>(
            this.getDistributions(dataset)
        );
        // return AsyncPage.singlePromise<DapDistribution[]>(this.requestDistributions(dataset.data))
    }

    public packageSearch(options?: {
        ignoreHarvestSources?: string[];
        q?: string;
        p?: number;
        soud?: string;
        sb?: string;
        rpp?: number;
    }): AsyncPage<DapPackageSearchResponse> {
        const url = new URI(this.urlBuilder.getPackageSearchUrl());

        const solrQueries = [];

        if (
            options &&
            options.ignoreHarvestSources &&
            options.ignoreHarvestSources.length > 0
        ) {
            solrQueries.push(
                ...options.ignoreHarvestSources.map(title => {
                    const encoded =
                        title === "*"
                            ? title
                            : encodeURIComponent('"' + title + '"');
                    return `-harvest_source_title:${encoded}`;
                })
            );
        }

        let fqComponent = "";
        if (solrQueries.length > 0) {
            fqComponent = "&q=" + solrQueries.join("+");
        }

        if (options && options.sb) {
            url.addSearch("sb", options.sb);
        }
        if (options && options.soud) {
            url.addSearch("soud", options.soud);
        }

        const startStart = options.p || 1;
        let startIndex = startStart;

        return AsyncPage.create<DapPackageSearchResponse>(previous => {
            if (previous) {
                if (
                    startIndex * previous.resultsPerPage >=
                    previous.totalResults
                ) {
                    return undefined;
                } else {
                    startIndex = startIndex + 1;
                }
            }
            const remaining = options.rpp
                ? startIndex * options.rpp - previous.totalResults
                : undefined;
            return this.requestPackageSearchPage(
                url,
                fqComponent,
                startIndex,
                remaining
            );
        });
    }

    searchDatasetsByTitle(title: string, maxResults: number): AsyncPage<any[]> {
        return AsyncPage.single([this.organization]);
    }

    public getJsonFirstClassOrganizations(): AsyncPage<any[]> {
        return AsyncPage.single([this.organization]);
    }

    getJsonFirstClassOrganization(id: string): Promise<any> {
        return Promise.resolve(this.organization);
    }

    searchFirstClassOrganizationsByTitle(
        title: string,
        maxResults: number
    ): AsyncPage<any[]> {
        return AsyncPage.single([this.organization]);
    }

    public getJsonDatasetPublisherId(dataset: any): string {
        return "CSIRO";
    }
    getJsonDatasetPublisher(dataset: any): Promise<any> {
        return Promise.resolve(this.organization);
    }

    // Custom this function following the DAP API specification: https://confluence.csiro.au/display/daphelp/Web+Services+Interface
    private requestPackageSearchPage(
        url: uri.URI,
        fqComponent: string,
        startIndex: number,
        maxResults: number
    ): Promise<DapPackageSearchResponse> {
        const pageSize =
            maxResults && maxResults < this.pageSize
                ? maxResults
                : this.pageSize;

        const pageUrl = url.clone();
        pageUrl.addSearch("p", startIndex);
        pageUrl.addSearch("rpp", pageSize);

        const operation = () =>
            new Promise<DapPackageSearchResponse>((resolve, reject) => {
                const requestUrl = pageUrl.toString() + fqComponent;
                // console.log("Requesting " + requestUrl);
                request(
                    requestUrl,
                    { json: true },
                    async (error, response, body) => {
                        if (error) {
                            reject(error);
                            return;
                        }
                        console.log("Received@" + startIndex);
                        if (
                            response.statusCode !== 200 ||
                            body.dataCollections === undefined
                        ) {
                            reject(
                                "Response with code=" +
                                    response.statusCode +
                                    ", data retrieve will exist at page " +
                                    startIndex
                            );
                            return;
                        }
                        // Different ckan which will return detailed data with distributions, DAP collection queries just returns summary kinds of data
                        // To make the returned data contains detailed data, used Promise.all(dataset.id.identifier) to query detail data again use another api
                        await Promise.all(
                            body.dataCollections.map((simpleData: any) => {
                                const url = this.urlBuilder.getPackageShowUrl(
                                    simpleData.id.identifier
                                );
                                return new Promise<any>((resolve2, reject2) => {
                                    request(
                                        url,
                                        { json: true },
                                        (error, response, detail) => {
                                            console.log(
                                                ">> request detail of " + url
                                            );
                                            if (error) {
                                                reject2(error);
                                                return;
                                            }
                                            resolve2(detail);
                                        }
                                    );
                                });
                            })
                        )
                            .then(values => {
                                body["detailDataCollections"] = values;
                            })
                            .catch(error => console.log(error));
                        // DAP has dataset which included thousands of distributions (spacial data)
                        // Harvest these distributoions will cause the magda harvest and indexer process really slow (days)
                        // Read environment param distributionSize and harvest only limited distributions with every formats data included
                        await Promise.all(
                            body.detailDataCollections.map(
                                (simpleData: any) => {
                                    // const url = this.urlBuilder.getPackageShowUrl(simpleData.id.identifier);
                                    if (simpleData.data) {
                                        return new Promise<any>(
                                            (resolve3, reject3) => {
                                                request(
                                                    simpleData.data,
                                                    { json: true },
                                                    (
                                                        error,
                                                        response,
                                                        detail
                                                    ) => {
                                                        console.log(
                                                            ">> request distribution of " +
                                                                simpleData.data,
                                                            detail.file.length
                                                        );
                                                        if (error) {
                                                            reject3(error);
                                                            return;
                                                        }
                                                        let distributionMap: Map<
                                                            String,
                                                            object[]
                                                        > = new Map();
                                                        for (let file of detail.file) {
                                                            let mediaType =
                                                                file["link"][
                                                                    "mediaType"
                                                                ];
                                                            let distributionObj: any = {};
                                                            distributionObj[
                                                                "licence"
                                                            ] =
                                                                detail[
                                                                    "licence"
                                                                ];
                                                            distributionObj[
                                                                "accessURL"
                                                            ] =
                                                                detail["self"];
                                                            distributionObj[
                                                                "downloadURL"
                                                            ] =
                                                                file["link"][
                                                                    "href"
                                                                ];
                                                            distributionObj[
                                                                "id"
                                                            ] =
                                                                file["id"];
                                                            distributionObj[
                                                                "mediaType"
                                                            ] = mediaType;
                                                            distributionObj[
                                                                "format"
                                                            ] = mediaType;
                                                            distributionObj[
                                                                "name"
                                                            ] =
                                                                file[
                                                                    "filename"
                                                                ];
                                                            let temp =
                                                                distributionMap.get(
                                                                    mediaType
                                                                ) || [];
                                                            temp.push(
                                                                distributionObj
                                                            );
                                                            distributionMap.set(
                                                                mediaType,
                                                                temp
                                                            );
                                                        }
                                                        // let avgDistSize = Math.ceil(this.distributionSize/distributionMap.size)
                                                        let returnDistribution: any = [];
                                                        for (let [
                                                            _,
                                                            dist
                                                        ] of distributionMap) {
                                                            returnDistribution = returnDistribution.concat(
                                                                dist.slice(
                                                                    0,
                                                                    Math.ceil(
                                                                        (dist.length *
                                                                            this
                                                                                .distributionSize) /
                                                                            detail
                                                                                .file
                                                                                .length
                                                                    )
                                                                )
                                                            );
                                                        }
                                                        resolve3({
                                                            identifier:
                                                                simpleData.id
                                                                    .identifier,
                                                            distributions: returnDistribution
                                                        });
                                                    }
                                                );
                                            }
                                        );
                                    } else {
                                        return new Promise<any>(
                                            (resolve, reject) => {
                                                resolve({
                                                    identifier:
                                                        simpleData.id
                                                            .identifier,
                                                    distributions: []
                                                });
                                            }
                                        );
                                    }
                                }
                            )
                        )
                            .then(values => {
                                body["distributions"] = values;
                            })
                            .catch(error => console.log(error));

                        for (let dataset of body.detailDataCollections) {
                            for (let dist of body.distributions) {
                                if (dataset.id.identifier === dist.identifier) {
                                    dataset["summarizedDistribution"] =
                                        dist.distributions;
                                }
                            }
                        }
                        await resolve(body);
                    }
                );
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
    getDistributions(dataset: any) {
        // console.log(dataset.summarizedDistribution)
        return Promise.resolve(dataset.summarizedDistribution);
    }
}

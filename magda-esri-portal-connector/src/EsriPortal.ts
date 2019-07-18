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
        return new Promise<any>((resolve, reject) => {
            request(
                this.urlBuilder.getResource(distributionUrl),
                { json: true },
                (error, response, body) => {
                    if (error) {
                        reject(error);
                        return;
                    }
                    resolve(body);
                }
            );
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
        const operation = async () =>
            new Promise<EsriPortalDataSearchResponse>((resolve, reject) => {
                const requestUrl = pageUrl.toString();
                console.log("Requesting " + requestUrl);

                request(
                    requestUrl,
                    { json: true },
                    async (error, response, body) => {
                        if (error) {
                            reject(error);
                            return;
                        }

                        // A single portal item only has one distribution in the form of a url.
                        // That url however may represent a single layer, or a map (containing multiple layers)
                        // The bulk of the distribution information needs to be retrieved
                        // from the map or feature service endpoint
                        // An individual item may result in one or many additional requests

                        for (let i = 0; i < body.results.length; ++i) {
                            const item = body.results[i];
                            const distUri = new URI(item.url);
                            console.log(distUri);
                            // We're looking at a tiled layer
                            if (item.typeKeywords.indexOf("Tiled") > -1) {
                                const distInfo = await that.requestDistributionInformation(
                                    item.url
                                );
                                if (distInfo.error) continue;
                                const dist = {
                                    name: distInfo.documentInfo.Title,
                                    description: distInfo.serviceDescription,
                                    accessURL: item.url,
                                    type: "Esri Tiled Map Service",
                                    id: `${item.id}-0`
                                };
                                const mainDist = JSON.stringify(dist);
                                item.distributions = [dist];

                                if (
                                    distInfo.supportedExtensions.indexOf(
                                        "WMSServer"
                                    ) > -1
                                ) {
                                    const wmtsDist = JSON.parse(mainDist);
                                    wmtsDist.name = wmtsDist.name.concat(
                                        " WMTS"
                                    );
                                    wmtsDist.id = `${item.id}-1`;
                                    wmtsDist.accessURL = distUri
                                        .clone()
                                        .segment("WMTS")
                                        .segment("1.0.0")
                                        .segment("WMTSCapabilities.xml")
                                        .toString()
                                        .replace("/rest", "");
                                    wmtsDist.type = "WMTS";
                                    item.distributions.push(wmtsDist);
                                }

                                // We're looking at a set of layers
                                // eg https://maps.six.nsw.gov.au/arcgis/rest/services/public/Valuation/MapServer
                            } else if (
                                (distUri.segment(-1) === "MapServer" ||
                                    "FeatureServer") &&
                                item.typeKeywords.indexOf("Tiled") === -1
                            ) {
                                const distInfo = await that.requestDistributionInformation(
                                    item.url
                                );
                                if (distInfo.error) continue;
                                if (distUri.segment(-1) === "MapServer") {
                                    const name =
                                        distInfo.documentInfo.Title.length > 0
                                            ? distInfo.documentInfo.Title
                                            : distInfo.mapName;
                                    const dist = {
                                        title: name,
                                        name: name,
                                        description:
                                            distInfo.description.length > 0
                                                ? distInfo.description
                                                : distInfo.serviceDescription,
                                        accessURL: distUri.clone().toString(),
                                        type: `Esri ${item.type}`,
                                        id: `${item.id}-0`
                                    };

                                    item.distributions = [dist];
                                    const mainDist = JSON.stringify(dist);

                                    if (
                                        distInfo.supportedExtensions.indexOf(
                                            "WMSServer"
                                        ) > -1
                                    ) {
                                        const wmsDist = JSON.parse(mainDist);
                                        wmsDist.name = wmsDist.name.concat(
                                            " WMS"
                                        );
                                        wmsDist.id = `${item.id}-1`;
                                        wmsDist.accessURL = distUri
                                            .clone()
                                            .segment("WMSServer")
                                            .addSearch({
                                                request: "GetCapabilities",
                                                service: "WMS"
                                            })
                                            .toString()
                                            .replace("/rest", "");
                                        wmsDist.type = "WMS";
                                        item.distributions.push(wmsDist);
                                    }
                                } else {
                                    item.distributions = [];
                                }
                                for (
                                    let ii = 0;
                                    ii < distInfo.layers.length;
                                    ++ii
                                ) {
                                    const lyr = distInfo.layers[ii];
                                    const lyrUrl = distUri
                                        .clone()
                                        .segment(lyr.id.toString())
                                        .toString();
                                    const subDistInfo = await that.requestDistributionInformation(
                                        lyrUrl
                                    );
                                    if (subDistInfo.error) continue;
                                    const subDist = {
                                        accessURL: lyrUrl,
                                        title: subDistInfo.name,
                                        name: subDistInfo.name,
                                        description: subDistInfo.description,
                                        type: `Esri ${subDistInfo.type}`,
                                        id: `${item.id}-c${lyr.id}`
                                    };
                                    item.distributions.push(subDist);
                                }

                                // We're looking at an individual layer (coule be either map or feature service)
                                // eg https://maps.six.nsw.gov.au/arcgis/rest/services/public/Valuation/MapServer/0
                            } else if (!isNaN(parseInt(distUri.segment(-1)))) {
                                const distInfo = await that.requestDistributionInformation(
                                    item.url
                                );
                                if (distInfo.error) continue;
                                const dist = {
                                    title: distInfo.name,
                                    name: distInfo.name,
                                    description: distInfo.description,
                                    accessURL: distUri.clone().toString(),
                                    type: distInfo.type,
                                    id: `${item.id}-0`
                                };
                                item.distributions = [dist];
                            }
                        }
                        resolve(body);
                    }
                );

                // Promise.all(distributionPromises).then(values => {
                //     body.results.forEach(function(
                //         item: any,
                //         index: number
                //     ) {
                //         const distributionForDataset: any = values[index];
                //         distributionForDataset.id = `${item.id}-0`;
                //         // distributionForDataset.type = item.type
                //         // distributionForDataset.accessUrl = item.url
                //         // distributionForDataset.license = item.license
                //         item.distributions = [distributionForDataset];
                //     },
                //     this);
                //     resolve(body);
                // });
                // console.log("Received@",  body);
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

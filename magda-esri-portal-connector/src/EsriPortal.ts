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
    arcgisUserId?: string;
    arcgisUserPassword?: string;
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

    public getToken(username: string, password: string) {
        const that = this;
        return new Promise<any>((resolve, reject) => {
            request.post(
                {
                    url: this.urlBuilder.getTokenUrl(),
                    json: true,
                    form: {
                        username: username,
                        password: password,
                        f: "pjson",
                        expiration: 1440, // 1 day
                        client: "referer",
                        referer: "http://localhost:6113"
                    }
                },
                function(err, resp, body) {
                    console.log("Token Retrieved");
                    that.urlBuilder.token = body.token;
                    resolve();
                }
            );
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

    private requestGroupInformation(contentId: string): Promise<any> {
        return new Promise<any>((resolve, reject) => {
            request(
                this.urlBuilder.getContentItemGroups(contentId),
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
                            item.distributions = [];

                            const distUri = new URI(item.url);

                            if (item.access !== "public") {
                                // Let's get the group information for an item because that's how
                                // access to the item is controlled
                                const groupInfo = await that.requestGroupInformation(
                                    item.id
                                );

                                const adminGroupIds = groupInfo.admin.map(
                                    (g: any) => g.id
                                );
                                const memberGroupIds = groupInfo.member.map(
                                    (g: any) => g.id
                                );
                                const otherGroupIds = groupInfo.other.map(
                                    (g: any) => g.id
                                );

                                const allGroups = adminGroupIds.concat(
                                    memberGroupIds,
                                    otherGroupIds
                                );
                                const uniqueGroups = allGroups.filter(
                                    (it: any, idx: any) =>
                                        allGroups.indexOf(it) === idx
                                );
                                item.groups =
                                    uniqueGroups.length > 0
                                        ? uniqueGroups
                                        : undefined;
                            } else {
                                item.groups = undefined;
                            }

                            // We're looking at an individual layer (could be either map or feature service)
                            // eg https://maps.six.nsw.gov.au/arcgis/rest/services/public/Valuation/MapServer/0
                            if (!isNaN(parseInt(distUri.segment(-1)))) {
                                try {
                                    await this.processIndividualLayerAsDataset(
                                        item,
                                        distUri
                                    );
                                } catch (err) {
                                    console.log("Broke on ", item.url);
                                    console.log(err);
                                }

                                // We're looking at a group of layers which we may need to iterate over
                                // to get multiple distributions
                                // eg https://maps.six.nsw.gov.au/arcgis/rest/services/public/Valuation/MapServer
                            } else {
                                try {
                                    const distInfo = await that.requestDistributionInformation(
                                        item.url
                                    );
                                    if (distInfo.error) continue;

                                    // We're dealing with a tiled layer that doesn't have crawlable sublayers
                                    if (
                                        item.type !== "Feature Service" &&
                                        distInfo.singleFusedMapCache !== false
                                    ) {
                                        await that.processTiledLayerAsDistribution(
                                            item,
                                            distInfo,
                                            distUri
                                        );
                                        continue;
                                    }

                                    // For a MapServer treat the root as a distribution (eg the group of layers)
                                    if (distUri.segment(-1) === "MapServer") {
                                        await that.processRootMapServiceAsDistribution(
                                            item,
                                            distInfo,
                                            distUri
                                        );
                                    }

                                    for (
                                        let ii = 0;
                                        ii < distInfo.layers.length;
                                        ++ii
                                    ) {
                                        const lyr = distInfo.layers[ii];
                                        await that.processLayerAsDistribution(
                                            lyr,
                                            item,
                                            distUri
                                        );
                                    }
                                } catch (err) {
                                    console.log("Broke on ", item.url);
                                    console.log(err);
                                }
                            }
                        }

                        resolve(body);
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

    private async processIndividualLayerAsDataset(item: any, distUri: any) {
        try {
            const distInfo = await this.requestDistributionInformation(
                item.url
            );
            if (distInfo.error) return;
            const dist = {
                title: distInfo.name,
                name: distInfo.name,
                description: distInfo.description,
                accessURL: distUri.clone().toString(),
                type: distInfo.type,
                id: `${item.id}-0`
            };
            item.distributions.push(dist);
        } catch (err) {
            console.log(err);
        }
    }

    private async processTiledLayerAsDistribution(
        item: any,
        distInfo: any,
        distUri: any
    ) {
        try {
            let distName = null;
            if (item.type === "Map Service") {
                // Sometimes people don't populate the documentInfo
                distName =
                    distInfo.documentInfo &&
                    distInfo.documentInfo.Title &&
                    distInfo.documentInfo.Title.length > 0
                        ? distInfo.documentInfo.Title
                        : distInfo.mapName;
            } else {
                // An image service doesnt have documentInfo
                distName = distInfo.name;
            }
            const dist = {
                name: distName,
                description: distInfo.serviceDescription,
                accessURL: item.url,
                type: "Esri Tiled Map Service",
                id: `${item.id}-0`
            };
            item.distributions.push(dist);

            if (
                distInfo.supportedExtensions &&
                distInfo.supportedExtensions.indexOf("WMSServer") > -1
            ) {
                const wmtsDist = JSON.parse(JSON.stringify(dist));
                wmtsDist.name = wmtsDist.name.concat(" WMTS");
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
        } catch (err) {
            console.log(err);
        }
    }

    private async processLayerAsDistribution(
        lyr: any,
        item: any,
        distUri: any
    ) {
        try {
            const lyrUrl = distUri
                .clone()
                .segment(lyr.id.toString())
                .toString();
            const subDistInfo = await this.requestDistributionInformation(
                lyrUrl
            );
            if (subDistInfo.error) return;
            const subDist = {
                accessURL: lyrUrl,
                title: subDistInfo.name,
                name: subDistInfo.name,
                description: subDistInfo.description,
                type: `Esri ${subDistInfo.type}`,
                id: `${item.id}-c${lyr.id}`
            };
            item.distributions.push(subDist);
        } catch (err) {
            console.log(err);
        }
    }

    private async processRootMapServiceAsDistribution(
        item: any,
        distInfo: any,
        distUri: any
    ) {
        let distName = null;
        if (item.type === "Map Service") {
            // Sometimes people don't populate the documentInfo
            distName =
                distInfo.documentInfo.Title.length > 0
                    ? distInfo.documentInfo.Title
                    : distInfo.mapName;
        } else {
            // An image service doesnt have documentInfo
            distName = distInfo.name;
        }
        const distDesc = distInfo.description;
        const dist = {
            name: distName,
            description:
                distDesc.length > 0 ? distDesc : distInfo.serviceDescription,
            accessURL: distUri.clone().toString(),
            type: `Esri ${item.type}`,
            id: `${item.id}-0`
        };

        item.distributions.push(dist);

        if (
            distInfo.supportedExtensions &&
            distInfo.supportedExtensions.indexOf("WMSServer") > -1
        ) {
            const wmsDist = JSON.parse(JSON.stringify(dist));
            wmsDist.name = wmsDist.name.concat(" WMS");
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
    }
}

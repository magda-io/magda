import AsyncPage, {
    forEachAsync
} from "@magda/typescript-common/dist/AsyncPage";
import CkanUrlBuilder from "./CkanUrlBuilder";
import formatServiceError from "@magda/typescript-common/dist/formatServiceError";
import { ConnectorSource } from "@magda/typescript-common/dist/JsonConnector";
import retry from "@magda/typescript-common/dist/retry";
import request from "@magda/typescript-common/dist/request";
import * as URI from "urijs";

export interface CkanThing {
    id: string;
    name: string;
    [propName: string]: any;
}

export interface CkanResource extends CkanThing {}

export interface CkanDataset extends CkanThing {
    resources: CkanResource[];
}

export interface CkanOrganization extends CkanThing {}

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
    id: string;
    name: string;
    apiBaseUrl?: string;
    pageSize?: number;
    maxRetries?: number;
    secondsBetweenRetries?: number;
    ignoreHarvestSources?: string[];
    allowedOrganisationName?: string;
}

export default class Ckan implements ConnectorSource {
    public readonly id: string;
    public readonly name: string;
    public readonly pageSize: number;
    public readonly maxRetries: number;
    public readonly secondsBetweenRetries: number;
    public readonly urlBuilder: CkanUrlBuilder;
    private ignoreHarvestSources: string[];
    private allowedOrganisationName: string;

    constructor({
        baseUrl,
        id,
        name,
        apiBaseUrl,
        pageSize = 1000,
        maxRetries = 10,
        secondsBetweenRetries = 10,
        ignoreHarvestSources = [],
        allowedOrganisationName = null
    }: CkanOptions) {
        this.id = id;
        this.name = name;
        this.pageSize = pageSize;
        this.maxRetries = maxRetries;
        this.secondsBetweenRetries = secondsBetweenRetries;
        this.ignoreHarvestSources = ignoreHarvestSources;
        this.allowedOrganisationName = allowedOrganisationName;
        this.urlBuilder = new CkanUrlBuilder({
            id: id,
            name: name,
            baseUrl,
            apiBaseUrl
        });
    }

    public packageSearch(options?: {
        allowedOrganisationName?: string;
        ignoreHarvestSources?: string[];
        title?: string;
        sort?: string;
        start?: number;
        maxResults?: number;
    }): AsyncPage<CkanPackageSearchResponse> {
        const url = new URI(this.urlBuilder.getPackageSearchUrl());

        const solrQueries = [];

        if (
            options &&
            options.allowedOrganisationName &&
            typeof options.allowedOrganisationName === "string"
        ) {
            solrQueries.push(
                `organization:${encodeURIComponent(
                    `"${options.allowedOrganisationName}"`
                )}`
            );
        }

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

        if (options && options.title && options.title.length > 0) {
            const encoded = encodeURIComponent('"' + options.title + '"');
            solrQueries.push(`title:${encoded}`);
        }

        let fqComponent = "";

        if (solrQueries.length > 0) {
            fqComponent = "&fq=" + solrQueries.join("%20");
        }

        if (options && options.sort) {
            url.addSearch("sort", options.sort);
        }

        const startStart = options.start || 0;
        let startIndex = startStart;

        return AsyncPage.create<CkanPackageSearchResponse>(previous => {
            if (previous) {
                startIndex += this.pageSize;
                if (
                    startIndex >= previous.result.count ||
                    (options.maxResults &&
                        startIndex - startStart >= options.maxResults)
                ) {
                    return undefined;
                }
            }

            const remaining = options.maxResults
                ? options.maxResults - (startIndex - startStart)
                : undefined;
            return this.requestPackageSearchPage(
                url,
                fqComponent,
                startIndex,
                remaining
            );
        });
    }

    public organizationList(): AsyncPage<CkanOrganizationListResponse> {
        const url = new URI(this.urlBuilder.getOrganizationListUrl())
            .addSearch("all_fields", "true")
            .addSearch("include_users", "true")
            .addSearch("include_groups", "true")
            .addSearch("include_extras", "true")
            .addSearch("include_tags", "true");

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

    public getJsonDatasets(): AsyncPage<any[]> {
        const packagePages = this.packageSearch({
            ignoreHarvestSources: this.ignoreHarvestSources,
            allowedOrganisationName: this.allowedOrganisationName,
            sort: "metadata_created asc"
        });
        return packagePages.map(packagePage => packagePage.result.results);
    }

    public getJsonDataset(id: string): Promise<any> {
        const url = this.urlBuilder.getPackageShowUrl(id);

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

    public searchDatasetsByTitle(
        title: string,
        maxResults: number
    ): AsyncPage<any[]> {
        const packagePages = this.packageSearch({
            ignoreHarvestSources: this.ignoreHarvestSources,
            allowedOrganisationName: this.allowedOrganisationName,
            title: title,
            maxResults: maxResults
        });
        return packagePages.map(packagePage => packagePage.result.results);
    }

    public getJsonDistributions(dataset: any): AsyncPage<object[]> {
        return AsyncPage.single<object[]>(dataset.resources || []);
    }

    public readonly hasFirstClassOrganizations = true;

    public getJsonFirstClassOrganizations(): AsyncPage<object[]> {
        if (
            this.allowedOrganisationName &&
            typeof this.allowedOrganisationName === "string"
        ) {
            return new AsyncPage(undefined, false, async () => {
                return new AsyncPage(
                    [
                        await this.getJsonFirstClassOrganization(
                            this.allowedOrganisationName
                        )
                    ],
                    true,
                    undefined
                );
            });
        }
        const organizationPages = this.organizationList();
        return organizationPages.map(
            organizationPage => organizationPage.result
        );
    }

    public getJsonFirstClassOrganization(id: string): Promise<object> {
        const url = this.urlBuilder.getOrganizationShowUrl(id);

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

    public searchFirstClassOrganizationsByTitle(
        title: string,
        maxResults: number
    ): AsyncPage<any[]> {
        // CKAN doesn't have an equivalent of package_search for organizations, so we'll use
        // organization_autocomplete plus separate requests to look up the complete organization details.
        const url = new URI(
            this.urlBuilder.getOrganizationAutocompleteUrl(title)
        )
            .addSearch("limit", maxResults)
            .toString();

        const promise = new Promise<any>((resolve, reject) => {
            request(url, { json: true }, (error, response, body) => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve(body.result);
            });
        });

        // CKAN (at least v2.5.2 currently on data.gov.au) doesn't honor the `limit` parameter.  So trim the results here.
        const trimmedResults = AsyncPage.singlePromise<any[]>(promise).map(
            organizations => organizations.slice(0, maxResults)
        );

        const result: any[] = [];
        return AsyncPage.singlePromise<any[]>(
            forEachAsync(trimmedResults, 6, (organization: any) => {
                return this.getJsonFirstClassOrganization(organization.id).then(
                    organizationDetails => {
                        result.push(organizationDetails);
                    }
                );
            }).then(() => result)
        );
    }

    public getJsonDatasetPublisherId(dataset: any): string {
        if (!dataset.organization) {
            return undefined;
        }
        return dataset.organization.id;
    }

    public getJsonDatasetPublisher(dataset: any): Promise<any> {
        if (!dataset.organization) {
            return undefined;
        }
        return this.getJsonFirstClassOrganization(dataset.organization.id);
    }

    private requestPackageSearchPage(
        url: uri.URI,
        fqComponent: string,
        startIndex: number,
        maxResults: number
    ): Promise<CkanPackageSearchResponse> {
        const pageUrl = url.clone();
        pageUrl.addSearch("start", startIndex);
        pageUrl.addSearch("rows", this.pageSize);

        const operation = () =>
            new Promise<CkanPackageSearchResponse>((resolve, reject) => {
                const requestUrl = pageUrl.toString() + fqComponent;
                console.log("Requesting " + requestUrl);
                request(requestUrl, { json: true }, (error, response, body) => {
                    if (error) {
                        reject(error);
                        return;
                    }
                    console.log("Received@" + startIndex);
                    resolve(body);
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

    private requestOrganizationListPage(
        url: uri.URI,
        startIndex: number,
        previous: CkanOrganizationListResponse
    ): Promise<CkanOrganizationListResponse> {
        const pageUrl = url.clone();
        pageUrl.addSearch("offset", startIndex);
        pageUrl.addSearch("limit", this.pageSize);

        const operation = () =>
            new Promise<CkanOrganizationListResponse>((resolve, reject) => {
                console.log("Requesting " + pageUrl.toString());
                request(
                    pageUrl.toString(),
                    { json: true },
                    (error, response, body) => {
                        if (error) {
                            reject(error);
                            return;
                        }
                        console.log("Received@" + startIndex);

                        // Older versions of CKAN ignore the offset and limit parameters and just return all orgs.
                        // To avoid paging forever in that scenario, we check if this page is identical to the last one
                        // and ignore the items if so.
                        if (
                            previous &&
                            body &&
                            previous.result &&
                            body.result &&
                            previous.result.length === body.result.length &&
                            JSON.stringify(previous.result) ===
                                JSON.stringify(body.result)
                        ) {
                            body.result.length = 0;
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
}

import fetchRequest from "./fetchRequest.js";
import BaseApiClient, { BaseApiClientConfig } from "./BaseApiClient.js";

export interface SearchDatasetsParams {
    query?: string;
    start?: number; // default 0
    limit?: number; // default 10
    facetSize?: number; // default 10
    publisher?: string[];
    dateFrom?: string;
    dateTo?: string;
    region?: string[];
    format?: string[];
    publishingState?: string;
}

export interface SearchDistribution {
    identifier?: string; // distribution record id (maybe null)
    title?: string;
    description?: string;
    issued?: string;
    modified?: string;
    license?: string;
    rights?: string;
    accessURL?: string;
    downloadURL?: string;
    byteSize?: number;
    mediaType?: string;
    format?: string;
    [key: string]: any;
}

export interface SearchDataset {
    identifier: string; // dataset record id
    title?: string;
    catalog?: string;
    description?: string;
    issued?: string;
    modified?: string;
    languages?: string[];
    publisher?: Record<string, any>;
    accrualPeriodicity?: string;
    spatial?: Record<string, any>;
    temporal?: Record<string, any>;
    themes?: string[];
    keywords?: string[];
    contactPoint?: Record<string, any>;
    distributions: SearchDistribution[];
    landingPage?: string;
    indexed?: string;
    quality?: number;
    hasQuality?: boolean;
    source?: Record<string, any>;
    score?: number;
    publishingState?: string;
    [key: string]: any;
}

export interface SearchDatasetsResult {
    query?: Record<string, any>;
    hitCount: number;
    hitCountRelation?: string;
    facets?: any[];
    temporal?: Record<string, any>;
    dataSets: SearchDataset[];
    errorMessage?: string;
    strategy?: string;
}

export default class SearchApiClient extends BaseApiClient {
    constructor(options: BaseApiClientConfig) {
        options.baseApiUrl = options.baseApiUrl || "http://localhost:6102/v0";
        super(options);
    }

    async searchDatasets(
        params: SearchDatasetsParams = {},
        jwtToken?: string,
        tenantId?: number
    ): Promise<SearchDatasetsResult> {
        const uri = this.getBaseApiUri().segmentCoded("datasets");

        // query params
        if (typeof params.query !== "undefined") {
            uri.addSearch("query", params.query);
        }
        uri.addSearch("start", String(params.start ?? 0));
        uri.addSearch("limit", String(params.limit ?? 10));
        uri.addSearch("facetSize", String(params.facetSize ?? 10));

        params.publisher?.forEach((p) => uri.addSearch("publisher", p));
        if (typeof params.dateFrom !== "undefined") {
            uri.addSearch("dateFrom", params.dateFrom);
        }
        if (typeof params.dateTo !== "undefined") {
            uri.addSearch("dateTo", params.dateTo);
        }
        params.region?.forEach((r) => uri.addSearch("region", r));
        params.format?.forEach((f) => uri.addSearch("format", f));
        if (typeof params.publishingState !== "undefined") {
            uri.addSearch("publishingState", params.publishingState);
        }

        // auth + tenant headers
        const requestConfig = this.addAuthHeader();
        if (jwtToken) {
            requestConfig.headers = this.setHeader(
                requestConfig.headers,
                "X-Magda-Session",
                jwtToken
            );
        }
        const resolvedTenantId = tenantId === undefined ? 0 : tenantId;
        requestConfig.headers = this.setHeader(
            requestConfig.headers,
            "X-Magda-Tenant-Id",
            String(resolvedTenantId)
        );
        return await fetchRequest<SearchDatasetsResult>(
            "get",
            uri.toString(),
            undefined,
            undefined,
            false,
            requestConfig
        );
    }
}

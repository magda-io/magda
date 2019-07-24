import { FetchError } from "../types";

export type DatasetDistribution = {
    format: string;
    mediaType: string;
    downloadURL: string;
    description: string;
    modified: string;
    license: {
        name: string;
    };
    issued: string;
    title: string;
};

export type DatasetPublisher = {
    name: string;
    extraFields: {
        description: string;
    };
};

export type Dataset = {
    years: string;
    catalog: string;
    spatial: any;
    identifier: string;
    description: string;
    accrualPeriodicity: any;
    landingPage: string;
    keyword: Array<string>;
    modified: string;
    issued: string;
    contactPoint: any;
    temporal: {
        start: {
            date: string;
            text: string;
        };
        end: {
            date: string;
            text: string;
        };
    };
    language: string;
    distributions: Array<DatasetDistribution>;
    publisher: DatasetPublisher;
    title: string;
    theme: Array<any>;
    source: string;
};

export type FacetSearchJson = {
    options?: Array<any>;
    regions?: Array<any>;
    regionWmsMap?: any;
};

export type FacetOption = {
    value: string;
    hitCount: number;
    matched: boolean;
    lowerBound?: string;
    upperBound?: string;
};

export type FacetAction = {
    type: string;
    generalQuery?: string;
    facetQuery?: string;
    json?: FacetSearchJson;
    error?: FetchError;
    keyword?: string;
    items?: any[];
    item?: any;
};

type Facet = {
    id: string;
    options: Array<FacetOption>;
};

export type BoundingBox = {
    west: number;
    south: number;
    east: number;
    north: number;
};

export type Region = {
    regionId?: string;
    regionType?: string;
    regionName?: string;
    lv1Id?: string;
    lv2Id?: string;
    lv3Id?: string;
    lv4Id?: string;
    lv5Id?: string;
    boundingBox: BoundingBox;
};

export type Query = {
    quotes: Array<string>;
    freeText: string;
    regions?: Region[];
    formats: Array<string>;
    publishers: Array<string>;
    dateFrom?: string;
    dateTo?: string;
};

export type DataSearchJson = {
    query: Query;
    hitCount: number;
    dataSets: Array<Dataset>;
    strategy: string;
    facets: Array<Facet>;
    temporal?: any;
};

export type SearchAction = {
    type: string;
    apiQuery?: string;
    items?: Array<FacetOption>;
    item?: FacetOption;
    json?: DataSearchJson;
    error?: FetchError;
    queryObject?: any;
};

export type FacetSearchState = {
    data: Array<any>;
    facetQuery?: string;
    generalQuery?: string;
    isFetching?: boolean;
};

export type RegionMappingState = {
    data: any;
    isFetching?: boolean;
};

export type SearchState = {
    isFetching: boolean;
    datasets: Array<any>;
    hitCount: number;
    progress: number;
    activePublishers: Array<FacetOption>;
    activeFormats: Array<FacetOption>;
    activeRegion: Region;
    activeDateFrom?: string;
    activeDateTo?: string;
    freeText: string;
    publisherOptions: Array<any>;
    formatOptions: Array<any>;
    apiQuery: string;
    error?: FetchError;
    strategy: string;
    temporalRange?: any;
};

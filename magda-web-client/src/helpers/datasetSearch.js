// @flow
import type { FetchError } from "../types";

export type DatasetDistribution = {
    format: string,
    mediaType: string,
    downloadURL: string,
    description: string,
    modified: string,
    license: {
        name: string
    },
    issued: string,
    title: string
};

export type DatasetPublisher = {
    name: string,
    extraFields: {
        description: string
    }
};

export type Dataset = {
    years: string,
    catalog: string,
    spatial: Object,
    identifier: string,
    description: string,
    accrualPeriodicity: ?Object,
    landingPage: string,
    keyword: Array<string>,
    modified: string,
    issued: string,
    contactPoint: Object,
    temporal: {
        start: {
            date: string,
            text: string
        },
        end: {
            date: string,
            text: string
        }
    },
    language: string,
    distributions: Array<DatasetDistribution>,
    publisher: DatasetPublisher,
    title: string,
    theme: Array<any>
};

export type FacetSearchJson = {
    options?: Array<Object>,
    regions?: Array<Object>,
    regionWmsMap?: Object
};

export type FacetOption = {
    value: string,
    hitCount: number,
    matched: boolean,
    lowerBound?: string,
    upperBound?: string
};

export type FacetAction = {
    type: string,
    generalQuery?: string,
    facetQuery?: string,
    json?: FacetSearchJson,
    error?: FetchError
};

type Facet = {
    id: string,
    options: Array<FacetOption>
};

export type Region = {
    regionId: ?string,
    regionType: ?string,
    regionName?: string,
    boundingBox: {
        west: number,
        south: number,
        east: number,
        north: number
    }
};

export type Query = {
    quotes: Array<string>,
    freeText: string,
    regions: (?Region)[],
    formats: Array<string>,
    publishers: Array<string>,
    dateFrom?: string,
    dateTo?: string
};

export type DataSearchJson = {
    query: Query,
    hitCount: number,
    dataSets: Array<Dataset>,
    strategy: string,
    facets: Array<Facet>
};

export type SearchAction = {
    type: string,
    apiQuery?: string,
    items?: Array<FacetOption>,
    item?: FacetOption,
    json?: DataSearchJson,
    error?: FetchError
};

export type FacetSearchState = {
    data: Array<Object>,
    facetQuery?: string,
    generalQuery?: string,
    isFetching?: boolean
};

export type RegionMappingState = {
    data: Object,
    isFetching?: boolean
};

export type SearchState = {
    isFetching: boolean,
    datasets: Array<Object>,
    hitCount: number,
    progress: number,
    activePublishers: Array<FacetOption>,
    activeFormats: Array<FacetOption>,
    activeRegion: Region,
    activeDateFrom: ?string,
    activeDateTo: ?string,
    freeText: string,
    publisherOptions: Array<Object>,
    formatOptions: Array<Object>,
    apiQuery: string,
    error: ?FetchError,
    strategy: string
};

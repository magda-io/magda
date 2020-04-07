import { GeoJSON } from "geojson";

export type QueryRegion = {
    regionType: string;
    regionId: string;
};

export type Envelope = {
    type: "envelope";
    /** [[west, north], [east, south]] */
    coordinates: [[number, number], [number, number]];
};

export type Region = {
    regionSearchId: string;
    regionId: string;
    regionType: string;
    regionName: string;
    boundingBox: Envelope;
    regionShortName?: string;
    geometry?: GeoJSON;
};

export type Query = {
    freeText?: string;
    publishers: string[];
    dateFrom?: Date;
    dateTo?: Date;
    regions: QueryRegion[];
    formats: string[];
    publishingState: string[];
};

export type FacetType = "publisher" | "format";

export type Facet = {
    id: string;
    options: FacetOption[];
};

export type FacetOption = {
    identifier: string;
    value: string;
    hitCount: number;
    matched: boolean;
    countErrorUpperBound: number;
};

export type FacetSearchResult = {
    hitCount: number;
    options: FacetOption[];
};

export type ISODate = string;

export type ApiDate =
    | {
          date: ISODate;
          text?: string;
      }
    | {
          text: string;
          date?: ISODate;
      }
    | { date: ISODate; text: string };

export type PeriodOfTime = {
    start?: ApiDate;
    end?: ApiDate;
};

export type DataSource = {
    id: string;
    name?: string;
    extras?: { [key: string]: any };
};

export type Agent = {
    identifier: string;
    name?: string;
    description?: string;
    acronym?: string;
    jurisdiction?: string;
    aggKeywords?: string;
    email?: string;
    imageUrl?: string;
    phone?: string;
    addrStreet?: string;
    addrSuburb?: string;
    addrState?: string;
    addrPostCode?: string;
    addrCountry?: string;
    website?: string;
    source?: DataSource;
    datasetCount?: number;
};

export type Periodicity = {
    text?: string;
    /** Number of milliseconds */
    duration?: number;
};

export type License = {
    name?: string;
    url?: String;
};

export type Distribution = {
    identifier: string;
    title: string;
    description?: string;
    issued?: ISODate;
    modified?: ISODate;
    license?: License;
    rights?: string;
    accessURL?: string;
    downloadURL?: string;
    byteSize?: number;
    mediaType?: string;
    source?: DataSource;
    format?: string;
};

export type DcatCreation = {
    isInternallyProduced?: boolean;
    mechanism?: string;
    sourceSystem?: string;
    likelihoodOfRelease?: string;
    isOpenData?: boolean;
    affiliatedOrganisation?: string;
};

export type Location = {
    text?: string;
    geoJson?: GeoJSON;
};

export type Dataset = {
    identifier: string;
    title: string;
    catalog: string;
    description?: string;
    issued?: ISODate;
    modified?: ISODate;
    languages?: string[];
    publisher: Agent;
    accrualPeriodicity?: Periodicity;
    spatial?: Location;
    temporal?: PeriodOfTime;
    themes: string[];
    keywords: string[];
    contactPoint?: Agent;
    distributions: Distribution[];
    landingPage?: string;
    indexed?: ISODate;
    quality: number;
    hasQuality: boolean;
    source?: DataSource;
    creation?: DcatCreation;
    score?: number;
    publishingState?: string;
};

export type SearchResult = {
    query: Query;
    hitCount: number;
    facets: Facet[];
    temporal: PeriodOfTime;
    dataSets: Dataset[];
    errorMessage?: string;
    strategy: "match-all";
};

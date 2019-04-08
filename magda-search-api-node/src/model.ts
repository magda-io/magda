export type QueryRegion = {
    regionType: string;
    regionId: string;
};

export type BoundingBox = {
    north: number;
    east: number;
    south: number;
    west: number;
};

export type Region = {
    queryRegion: QueryRegion;
    regionName?: string;
    boundingBox?: BoundingBox;
    regionShortName?: string;
};

export type Query = {
    freeText?: string;
    publishers: string[];
    dateFrom?: Date;
    dateTo?: Date;
    regions: Region[];
    boostRegions: Region[];
    formats: string[];
    publishingState: string[];
};

export type FacetType = "Publisher" | "Format";

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

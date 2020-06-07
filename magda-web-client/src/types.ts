export type FetchError = {
    title: string;
    detail: string;
};

export type FeaturedAction = {
    type: string;
    json: Array<any>;
    error: Error;
};

export type StatsAction = {
    type: string;
    error: Error;
    payload: number;
};

export type Stats = {
    datasetCount: number;
    isFetchingDatasetCount: boolean;
    fetchDatasetCountError?: number;
};

export type Dispatch = (any) => Function;
export type GetState = () => any;

export type Action = {
    type: string;
    payload?: any;
    [key: string]: any;
};

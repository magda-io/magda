// @flow

export type FetchError = {
    title: string | number,
    detail: string
};

export type FeaturedAction = {
    type: string,
    json: Array<Object>,
    error: Error
};

export type StatsAction = {
    type: string,
    error: Error,
    payload: number
};

export type Stats = {
    datasetCount: number,
    isFetchingDatasetCount: boolean,
    fetchDatasetCountError: ?number
};

export type Dispatch = () => Function;
export type GetState = () => Object;

export type Action = {
    type: string,
    payload: ?object
};

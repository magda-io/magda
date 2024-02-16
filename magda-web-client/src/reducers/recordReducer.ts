import { parseDataset, parseDistribution } from "../helpers/record";

import {
    ParsedDataset,
    ParsedDistribution,
    RecordAction
} from "../helpers/record";
import { FetchError } from "types";

const initialData: RecordResult = {
    datasetIsFetching: false,
    distributionIsFetching: false,
    dataset: parseDataset(),
    distribution: parseDistribution()
};

type RecordResult = {
    datasetIsFetching: boolean;
    distributionIsFetching: boolean;
    datasetFetchError?: FetchError;
    distributionFetchError?: FetchError;
    dataset?: ParsedDataset;
    distribution?: ParsedDistribution;
    raw?: Record<string, any>;
    newDataset?: NewDataset;
};

type NewDataset = {
    isCreating?: boolean;
    error?: Error | null;
    dataset?: Record<string, any>;
};

const record = (state: RecordResult = initialData, action: RecordAction) => {
    switch (action.type) {
        case "REQUEST_DATASET":
            return Object.assign({}, state, {
                datasetIsFetching: true,
                datasetFetchError: undefined
            });
        case "RECEIVE_DATASET":
            return Object.assign({}, state, {
                datasetIsFetching: false,
                dataset: action.json && parseDataset(action.json),
                raw: action.json
            });
        case "REQUEST_DATASET_ERROR":
            return Object.assign({}, state, {
                datasetIsFetching: false,
                datasetFetchError: action.error
            });
        case "REQUEST_DISTRIBUTION":
            return Object.assign({}, state, {
                distributionIsFetching: true
            });
        case "RECEIVE_DISTRIBUTION":
            return Object.assign({}, state, {
                distributionIsFetching: false,
                distribution: action.json && parseDistribution(action.json)
            });
        case "RECEIVE_ASPECT_MODIFIED":
            const newRaw = JSON.parse(JSON.stringify(state.raw));
            Object.assign(
                newRaw.aspects[action.json.aspect],
                action.json.patch
            );
            return Object.assign({}, state, {
                datasetIsFetching: false,
                dataset: newRaw && parseDataset(newRaw),
                raw: newRaw
            });
        case "REQUEST_DISTRIBUTION_ERROR":
            return Object.assign({}, state, {
                distributionIsFetching: false,
                distributionFetchError: action.error
            });
        case "RESET_FETCH_RECORD":
            return initialData;
        case "DATASET_CREATE_ERROR":
            return Object.assign({}, state, {
                newDataset: {
                    isCreating: false,
                    error: action.error
                }
            });
        case "DATASET_CREATE_RESET":
            return Object.assign({}, state, {
                newDataset: {
                    isCreating: false,
                    error: null
                }
            });
        case "REQUEST_DATASET_CREATE":
            return Object.assign({}, state, {
                newDataset: {
                    isCreating: true,
                    dataset: action.json
                }
            });
        case "RECEIVE_NEW_DATASET":
            return Object.assign({}, state, {
                newDataset: {
                    isCreating: false,
                    dataset: action.json
                }
            });
        default:
            return state;
    }
};
export default record;

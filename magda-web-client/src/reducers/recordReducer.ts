import { parseDataset, parseDistribution } from "../helpers/record";

import {
    ParsedDataset,
    ParsedDistribution,
    RecordAction
} from "../helpers/record";

const initialData: RecordResult = {
    datasetIsFetching: false,
    distributionIsFetching: false,
    dataset: parseDataset(),
    distribution: parseDistribution()
};

type RecordResult = {
    datasetIsFetching: boolean;
    distributionIsFetching: boolean;
    datasetFetchError?: Object;
    distributionFetchError?: number;
    dataset?: ParsedDataset;
    distribution?: ParsedDistribution;
    raw?: Object;
    newDataset?: NewDataset;
};

type NewDataset = {
    isCreating?: boolean;
    error?: Object;
    dataset?: Object;
};

const record = (state: RecordResult = initialData, action: RecordAction) => {
    switch (action.type) {
        case "REQUEST_DATASET":
            return Object.assign({}, state, {
                datasetIsFetching: true,
                datasetFetchError: null
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
            let newRaw = JSON.parse(JSON.stringify(state.raw));
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

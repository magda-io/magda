// @flow
import { parseDataset, parseDistribution } from "../helpers/record";

import type {
    ParsedDataset,
    ParsedDistribution,
    RecordAction
} from "../helpers/record";

const initialData = {
    datasetIsFetching: false,
    distributionIsFetching: false,
    dataset: parseDataset(),
    distribution: parseDistribution(),
    datasetFetchError: null,
    distributionFetchError: null
};

type RecordResult = {
    datasetIsFetching: boolean,
    distributionIsFetching: boolean,
    datasetFetchError: ?number,
    distributionFetchError: ?number,
    dataset: ?ParsedDataset,
    distribution: ?ParsedDistribution
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
                dataset: action.json && parseDataset(action.json)
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
        case "REQUEST_DISTRIBUTION_ERROR":
            return Object.assign({}, state, {
                distributionIsFetching: false,
                distributionFetchError: action.error
            });
        default:
            return state;
    }
};
export default record;

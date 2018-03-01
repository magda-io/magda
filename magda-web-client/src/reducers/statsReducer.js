// @flow
import type { StatsAction, Stats } from "../types";

const initialData = {
    datasetCount: 0,
    isFetchingDatasetCount: false,
    fetchDatasetCountError: null
};

const statsReducer = (state: Stats = initialData, action: StatsAction) => {
    switch (action.type) {
        case "REQUEST_DATASET_COUNT":
            return Object.assign({}, state, {
                isFetchingDatasetCount: true,
                fetchDatasetCountError: null
            });
        case "FETCH_DATASET_COUNT_ERROR":
            return Object.assign({}, state, {
                isFetchingDatasetCount: false,
                fetchDatasetCountError: action.error
            });
        case "RECEIVE_DATASET_COUNT":
            return Object.assign({}, state, {
                isFetchingDatasetCount: false,
                datasetCount: action.payload,
                fetchDatasetCountError: null
            });

        default:
            return state;
    }
};

export default statsReducer;

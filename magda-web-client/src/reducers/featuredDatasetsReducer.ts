import { FeaturedAction } from "../types";
import { parseDataset } from "../helpers/record";
import { RawDataset } from "../helpers/record";

type FeaturedDatasets = {
    records: Array<RawDataset>;
    isFetching: boolean;
    error?: number;
    hitCount: number;
};

const initialData: FeaturedDatasets = {
    records: [],
    isFetching: false,
    hitCount: 0
};

const featuredDatasetReducer = (
    state: FeaturedDatasets = initialData,
    action: FeaturedAction
) => {
    switch (action.type) {
        case "REQUEST_FEATURED_DATASETS":
            return Object.assign({}, state, {
                isFetching: true,
                error: null
            });
        case "REQUEST_FEATURED_DATASETS_ERROR":
            return Object.assign({}, state, {
                isFetching: false,
                error: action.error
            });
        case "RECEIVE_FEATURED_DATASETS":
            return Object.assign({}, state, {
                isFetching: false,
                records: action.json && action.json.map((d) => parseDataset(d)),
                error: null
            });

        default:
            return state;
    }
};
export default featuredDatasetReducer;

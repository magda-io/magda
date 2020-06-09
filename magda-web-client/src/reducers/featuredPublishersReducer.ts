import { parsePublisher } from "../helpers/publisher";
import { FeaturedAction } from "../types";
import { Publisher } from "../helpers/record";

type FeaturedPublisher = {
    publishers: Array<Publisher>;
    isFetching: boolean;
    error?: number;
    hitCount: number;
};

const initialData: FeaturedPublisher = {
    publishers: [],
    isFetching: false,
    hitCount: 0
};

const featuredPublishersReducer = (
    state: FeaturedPublisher = initialData,
    action: FeaturedAction
) => {
    switch (action.type) {
        case "REQUEST_FEATURED_PUBLISHERS":
            return Object.assign({}, state, {
                isFetching: true,
                error: null
            });
        case "REQUEST_FEATURED_PUBLISHERS_ERROR":
            return Object.assign({}, state, {
                isFetching: false,
                error: action.error
            });
        case "RECEIVE_FEATURED_PUBLISHERS":
            return Object.assign({}, state, {
                isFetching: false,
                publishers: action.json.map((p) => parsePublisher(p)),
                error: null
            });

        default:
            return state;
    }
};
export default featuredPublishersReducer;

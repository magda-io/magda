// @flow
import type { FacetAction, FacetSearchState } from "../helpers/datasetSearch";

const initialData = {
    isFetching: false,
    data: null,
    error: null
};

const facetPublisher = (
    state: FacetSearchState = initialData,
    action: FacetAction
) => {
    switch (action.type) {
        case "FACET_REQUEST_PUBLISHERS":
            return Object.assign({}, state, {
                isFetching: true,
                error: null,
                facetQuery: action.facetQuery
            });
        case "FACET_RESET_PUBLISHERS":
            return Object.assign({}, state, {
                error: null,
                data: null,
                facetQuery: ""
            });
        case "FACET_RECEIVE_PUBLISHERS":
            if (action.facetQuery === state.facetQuery) {
                return Object.assign({}, state, {
                    isFetching: false,
                    data:
                        action.json &&
                        action.json.options &&
                        action.json.options
                });
            } else {
                return state;
            }
        case "FACET_REQUEST_PUBLISHERS_FAILED":
            if (action.facetQuery === state.facetQuery) {
                return Object.assign({}, state, {
                    isFetching: false,
                    data: null,
                    error: action.error
                });
            } else {
                return state;
            }
        default:
            return state;
    }
};
export default facetPublisher;

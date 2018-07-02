// @flow
import type { FacetAction, FacetSearchState } from "../helpers/datasetSearch";

const initialData = {
    isFetching: false,
    data: null,
    error: null,
    facetQuery: ""
};

const facetFormatSearch = (
    state: FacetSearchState = initialData,
    action: FacetAction
) => {
    switch (action.type) {
        case "FACET_REQUEST_FORMATS":
            return Object.assign({}, state, {
                isFetching: true,
                error: null,
                facetQuery: action.facetQuery
            });
        case "FACET_RESET_FORMATS":
            return Object.assign({}, state, {
                error: null,
                data: null,
                facetQuery: ""
            });
        case "FACET_RECEIVE_FORMATS":
            if (action.facetQuery === state.facetQuery) {
                return Object.assign({}, state, {
                    isFetching: false,
                    error: null,
                    data:
                        action.json &&
                        action.json.options &&
                        action.json.options
                });
            } else {
                return state;
            }
        case "FACET_REQUEST_FORMATS_FAILED":
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
export default facetFormatSearch;

// @flow
import type { FacetAction, FacetSearchState } from "../helpers/datasetSearch";

const initialData = {
    isFetching: false,
    data: null,
    error: null
};

const facetFormatSearch = (
    state: FacetSearchState = initialData,
    action: FacetAction
) => {
    switch (action.type) {
        case "FACET_REQUEST_FORMATS":
            return Object.assign({}, state, {
                isFetching: true,
                error: null
            });
        case "FACET_RESET_FORMATS":
            return Object.assign({}, state, {
                error: null,
                data: null
            });
        case "FACET_RECEIVE_FORMATS":
            return Object.assign({}, state, {
                isFetching: false,
                error: null,
                data: action.json && action.json.options && action.json.options
            });
        case "FACET_REQUEST_FORMATS_FAILED":
            return Object.assign({}, state, {
                isFetching: false,
                data: null,
                error: action.error
            });
        default:
            return state;
    }
};
export default facetFormatSearch;

import { FacetAction, RegionMappingState } from "../helpers/datasetSearch";

const initialData: RegionMappingState = {
    isFetching: false,
    data: {}
};

const regionMapping = (
    state: RegionMappingState = initialData,
    action: FacetAction
) => {
    switch (action.type) {
        case "REQUEST_REGION_MAPPING":
            return Object.assign({}, state, {
                isFetching: true
            });
        case "RECEIVE_REGION_MAPPING":
            return Object.assign({}, state, {
                isFetching: false,
                data:
                    action.json &&
                    action.json.regionWmsMap &&
                    action.json.regionWmsMap
            });
        case "REQUEST_REGION_MAPPING_ERROR":
            return Object.assign({}, state, {
                isFetching: false,
                error: action.error
            });
        default:
            return state;
    }
};
export default regionMapping;

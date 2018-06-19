// @flow
import { parseOrganisation } from "../helpers/organisation";
import type { FeaturedAction } from "../types";
import type { Organisation } from "../helpers/record";

type FeaturedOrganisation = {
    organisations: Array<Organisation>,
    isFetching: boolean,
    error: ?number
};

const initialData = {
    organisations: [],
    isFetching: false,
    error: null,
    hitCount: 0
};

const featuredOrganisationsReducer = (
    state: FeaturedOrganisation = initialData,
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
                organisations: action.json.map(p => parseOrganisation(p)),
                error: null
            });

        default:
            return state;
    }
};
export default featuredOrganisationsReducer;

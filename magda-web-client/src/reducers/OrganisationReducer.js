// @flow
import { parseOrganisation } from "../helpers/organisation";
import type { Organisation } from "../helpers/record";

const initialData = {
    isFetchingOrganisations: false,
    isFetchingOrganisation: false,
    organisations: [],
    organisation: parseOrganisation(),
    hitCount: 0,
    errorFetchingOrganisations: undefined,
    errorFetchingOrganisation: undefined
};

type OrganisationsResult = {
    isFetchingOrganisations: boolean,
    isFetchingOrganisation: boolean,
    organisations: Array<Organisation>,
    organisation: Organisation,
    hitCount: number,
    errorFetchingOrganisations: any,
    errorFetchingOrganisation: any
};

type recordAction = {
    json: Object,
    error: any,
    type: boolean
};

const organisation = (
    state: OrganisationsResult = initialData,
    action: recordAction
) => {
    switch (action.type) {
        case "REQUEST_PUBLISHERS":
            return Object.assign({}, state, {
                isFetchingOrganisations: true
            });
        case "RECEIVE_PUBLISHERS":
            return Object.assign({}, state, {
                isFetchingOrganisations: false,
                organisations:
                    action.json &&
                    action.json.records &&
                    action.json.records.map(r => parseOrganisation(r)),
                hitCount: action.json && action.json.totalCount
            });
        case "REQUEST_PUBLISHERS_ERROR":
            return Object.assign({}, state, {
                isFetchingOrganisations: false,
                errorFetchingOrganisations: action.error
            });
        case "REQUEST_PUBLISHER":
            return Object.assign({}, state, {
                isFetchingOrganisation: true
            });
        case "RECEIVE_PUBLISHER":
            return Object.assign({}, state, {
                isFetchingOrganisation: false,
                organisation: action.json && parseOrganisation(action.json)
            });
        case "REQUEST_PUBLISHER_ERROR":
            return Object.assign({}, state, {
                isFetchingOrganisation: false,
                errorFetchingOrganisation: action.error
            });
        default:
            return state;
    }
};
export default organisation;

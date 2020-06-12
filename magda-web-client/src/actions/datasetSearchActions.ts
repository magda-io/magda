import buildSearchQueryString, {
    Query
} from "../helpers/buildSearchQueryString";
import { actionTypes } from "../constants/ActionTypes";
import { FetchError, Dispatch } from "../types";
import {
    DataSearchJson,
    FacetAction,
    SearchAction
} from "../helpers/datasetSearch";
import { searchDatasets } from "api-clients/SearchApis";

export function requestResults(
    queryObject: any,
    apiQuery: string
): SearchAction {
    return {
        type: actionTypes.REQUEST_RESULTS,
        queryObject,
        apiQuery
    };
}

export function receiveResults(
    apiQuery: string,
    json: DataSearchJson
): SearchAction {
    return {
        type: actionTypes.RECEIVE_RESULTS,
        apiQuery,
        json
    };
}

export function transferFailed(error: FetchError): SearchAction {
    return {
        type: actionTypes.FETCH_ERROR,
        error
    };
}

export function resetDatasetSearch(): SearchAction {
    return {
        type: actionTypes.RESET_DATASET_SEARCH
    };
}

export function fetchSearchResults(queryObject: Query) {
    return (dispatch: Dispatch) => {
        const queryString = buildSearchQueryString(queryObject);
        dispatch(requestResults(queryObject, queryString));
        searchDatasets(queryObject)
            .then((json) => dispatch(receiveResults(queryString, json)))
            .catch((error) =>
                dispatch(
                    transferFailed({ title: error.name, detail: error.message })
                )
            );
    };
}

export function shouldFetchSearchResults(state: any, query: Query): boolean {
    const apiQuery = buildSearchQueryString(
        query,
        state.content.configuration.searchResultsPerPage
    );
    const datasetSearch = state.datasetSearch;
    if (!datasetSearch || (!query.q && !query)) {
        return false;
    } else if (datasetSearch.isFetching) {
        return false;
    } else if (apiQuery !== datasetSearch.apiQuery) {
        return true;
    } else {
        return false;
    }
}

export function fetchSearchResultsIfNeeded(urlQueryObject: Query) {
    return (dispatch, getState) => {
        const state = getState();
        if (shouldFetchSearchResults(state, urlQueryObject)) {
            return dispatch(fetchSearchResults(urlQueryObject));
        }
    };
}

export function updatePublishers(publishers: Array<any>): FacetAction {
    return {
        type: actionTypes.UPDATE_PUBLISHERS,
        items: publishers
    };
}

export function resetPublisher(): FacetAction {
    return {
        type: actionTypes.RESET_PUBLISHER
    };
}

export function updateFormats(formats: Array<any>): FacetAction {
    return {
        type: actionTypes.UPDATE_FORMATS,
        items: formats
    };
}

export function resetFormat(): FacetAction {
    return {
        type: actionTypes.RESET_FORMAT
    };
}

export function addRegion(region: string): FacetAction {
    return {
        type: actionTypes.ADD_REGION,
        item: region
    };
}

export function resetRegion(): FacetAction {
    return {
        type: actionTypes.RESET_REGION
    };
}

export function setDateFrom(date: string): FacetAction {
    return {
        type: actionTypes.SET_DATE_FROM,
        item: date
    };
}

export function setDateTo(date: string): FacetAction {
    return {
        type: actionTypes.SET_DATE_TO,
        item: date
    };
}

export function resetDateFrom(): FacetAction {
    return {
        type: actionTypes.RESET_DATE_FROM
    };
}

export function resetDateTo(): FacetAction {
    return {
        type: actionTypes.RESET_DATE_TO
    };
}

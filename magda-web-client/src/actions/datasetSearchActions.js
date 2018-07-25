// @flow
import fetch from "isomorphic-fetch";
import buildSearchQueryString from "../helpers/buildSearchQueryString";
import { config } from "../config";
import { actionTypes } from "../constants/ActionTypes";
import type { FetchError } from "../types";
import type {
    DataSearchJson,
    FacetAction,
    SearchAction
} from "../helpers/datasetSearch";

export function requestResults(
    queryObject: Object,
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

export function fetchSearchResults(query: string, queryObject: Object): Store {
    return (dispatch: Dispatch) => {
        let url: string = config.searchApiUrl + `datasets?${query}`;
        dispatch(requestResults(queryObject, query));
        console.log(url);
        return fetch(url)
            .then((response: Object) => {
                if (response.status === 200) {
                    return response.json();
                }
                let errorMessage = response.statusText;
                if (!errorMessage)
                    errorMessage = "Failed to retrieve network resource.";
                throw new Error(errorMessage);
            })
            .then((json: DataSearchJson) => {
                return dispatch(receiveResults(query, json));
            })
            .catch(error =>
                dispatch(
                    transferFailed({ title: error.name, detail: error.message })
                )
            );
    };
}

export function shouldFetchSearchResults(
    state: Object,
    keyword: string,
    query: string
): boolean {
    const datasetSearch = state.datasetSearch;
    if (!datasetSearch || (!keyword && !query)) {
        return false;
    } else if (datasetSearch.isFetching) {
        return false;
    } else if (query !== datasetSearch.apiQuery) {
        return true;
    } else {
        return false;
    }
}

export function fetchSearchResultsIfNeeded(urlQueryObject: Object): Store {
    const apiQuery = buildSearchQueryString(urlQueryObject);
    return (dispatch, getState) => {
        if (shouldFetchSearchResults(getState(), urlQueryObject.q, apiQuery)) {
            return dispatch(fetchSearchResults(apiQuery, urlQueryObject));
        }
    };
}

export function updatePublishers(publishers: Array<Object>): FacetAction {
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

export function updateFormats(formats: Array<Object>): FacetAction {
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

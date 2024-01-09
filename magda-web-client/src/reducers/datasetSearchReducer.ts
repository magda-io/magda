import {
    SearchState,
    DataSearchJson,
    Dataset,
    Query,
    FacetOption,
    Region,
    SearchAction
} from "../helpers/datasetSearch";

import findIndex from "lodash/findIndex";
import findMatchingObjs from "../helpers/findMatchingObjs";
import queryFilterFormat from "../helpers/queryFilterFormat";
import regionToObject from "../helpers/regionToObject";

const initialData: SearchState = {
    isFetching: false,
    datasets: [],
    hitCount: 0,
    progress: 0,
    activePublishers: [],
    activeFormats: [],
    activeRegion: {
        regionId: undefined,
        regionType: undefined,
        boundingBox: {
            west: 105,
            south: -45,
            east: 155,
            north: -5
        }
    },
    freeText: "",
    publisherOptions: [],
    formatOptions: [],
    apiQuery: "",
    strategy: "match-all"
};

const datasetSearchReducer = (
    state: SearchState = initialData,
    action: SearchAction
) => {
    switch (action.type) {
        case "REQUEST_RESULTS":
            const queryObject = action.queryObject;
            const activePub = queryFilterFormat(queryObject.organisation);
            const activeFormat = queryFilterFormat(queryObject.format);
            const regionSelected = regionToObject(queryObject);
            return Object.assign({}, state, {
                isFetching: true,
                error: null,
                apiQuery: action.apiQuery && action.apiQuery,
                queryObject,
                temporalRange: [
                    new Date(queryObject.dateFrom),
                    new Date(queryObject.dateTo)
                ],
                publisherOptions: initialData.publisherOptions,
                formatOptions: initialData.formatOptions,
                activePublishers: activePub,
                activeRegions: regionSelected,
                activeDateFrom: queryObject.dateFrom
                    ? queryObject.dateFrom
                    : initialData.activeDateFrom,
                activeDateTo: queryObject.dateTo
                    ? queryObject.activeDateTo
                    : initialData.activeDateTo,
                activeFormats: activeFormat
            });
        case "FETCH_ERROR":
            return Object.assign({}, state, {
                isFetching: false,
                error: action.error
            });
        case "RESET_DATASET_SEARCH":
            return Object.assign({}, state, {
                isFetching: false,
                error: null,
                datasets: [],
                hitCount: 0,
                apiQuery: ""
            });
        case "RECEIVE_RESULTS":
            const defaultJson: DataSearchJson = {
                query: {
                    quotes: [],
                    freeText: "",
                    regions: [],
                    formats: [],
                    publishers: []
                },
                hitCount: 0,
                dataSets: [],
                strategy: "",
                facets: []
            };
            const data: DataSearchJson = action.json
                ? action.json
                : defaultJson;
            const query: Query = data && data.query && data.query;
            const datasets: Array<Dataset> =
                data && data.dataSets && data.dataSets;
            const hitCount: number = data && data.hitCount && data.hitCount;
            const temporalRange: Array<any> =
                data &&
                data.temporal &&
                data.temporal.start &&
                data.temporal.end
                    ? [
                          new Date(data.temporal.start.date),
                          new Date(data.temporal.end.date)
                      ]
                    : initialData.temporalRange;

            const publisherOptions: Array<FacetOption> =
                data && data.facets && data.facets[0]
                    ? data.facets[0].options
                    : initialData.publisherOptions;
            const formatOptions: Array<FacetOption> =
                data && data.facets && data.facets[1]
                    ? data.facets[1].options
                    : initialData.formatOptions;

            const freeText: string = data.query.freeText;
            const activePublishers: Array<FacetOption> = findMatchingObjs(
                query.publishers,
                publisherOptions
            );
            const activeDateFrom = query.dateFrom
                ? query.dateFrom
                : initialData.activeDateFrom;
            const activeDateTo = query.dateTo
                ? query.dateTo
                : initialData.activeDateTo;
            const activeFormats: Array<FacetOption> = findMatchingObjs(
                query.formats,
                formatOptions
            );

            const activeRegion: Region =
                query.regions![0] || initialData.activeRegion;
            return Object.assign({}, state, {
                isFetching: false,
                apiQuery: action.apiQuery && action.apiQuery,
                strategy: data.strategy && data.strategy,
                datasets,
                hitCount,
                publisherOptions,
                formatOptions,
                temporalRange,
                freeText,
                activePublishers,
                activeRegion,
                activeDateFrom,
                activeDateTo,
                activeFormats,
                error: null
            });

        case "UPDATE_PUBLISHERS":
            return Object.assign({}, state, {
                activePublishers: action.items
            });

        case "RESET_PUBLISHER":
            return Object.assign({}, state, {
                activePublishers: initialData.activePublishers
            });

        case "ADD_REGION":
            return Object.assign({}, state, {
                activeRegion: action.item
            });

        case "RESET_REGION":
            return Object.assign({}, state, {
                activeRegion: initialData.activeRegion
            });

        case "SET_DATE_FROM":
            return Object.assign({}, state, {
                activeDateFrom: action.item
            });

        case "SET_DATE_TO":
            return Object.assign({}, state, {
                activeDateTo: action.item
            });

        case "RESET_DATE_FROM":
            return Object.assign({}, state, {
                activeDateFrom: initialData.activeDateFrom
            });

        case "RESET_DATE_TO":
            return Object.assign({}, state, {
                activeDateTo: initialData.activeDateTo
            });

        case "UPDATE_FORMATS":
            return Object.assign({}, state, {
                activeFormats: action.items
            });

        case "REMOVE_FORMAT":
            const formatIndex = findIndex(
                state.activeFormats,
                (item) => item.value === (action.item && action.item.value)
            );
            return Object.assign({}, state, {
                activeFormats: [
                    ...state.activeFormats.slice(0, formatIndex),
                    ...state.activeFormats.slice(formatIndex + 1)
                ]
            });

        case "RESET_FORMAT":
            return Object.assign({}, state, {
                activeFormats: initialData.activeFormats
            });

        default:
            return state;
    }
};
export default datasetSearchReducer;

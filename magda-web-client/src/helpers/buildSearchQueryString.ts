import defined from "./defined";
import flatten from "lodash/flatten";
import { defaultConfiguration } from "../config";

export type Query = {
    q?: string;
    dateFrom?: string;
    dateTo?: string;
    publisher?: string | Array<string>;
    organisation?: string | Array<string>;
    format?: string | Array<string>;
    regionId?: string;
    regionType?: string;
    page?: number;
    start?: number;
    limit?: number;
    publishingState?: string | Array<string>;
};

export default function buildSearchQueryString(
    query: Query,
    searchResultsPerPage: number = defined(query.limit)
        ? query.limit!
        : defaultConfiguration.searchResultsPerPage
) {
    let keywords = queryToString("query", query.q);
    let dateFroms = queryToString("dateFrom", query.dateFrom);
    let dateTos = queryToString("dateTo", query.dateTo);
    let publishers = queryToString(
        "publisher",
        query.organisation || query.publisher
    );
    let formats = queryToString("format", query.format);
    let locations = queryToString(
        "region",
        queryToLocation(query.regionId, query.regionType)
    );

    let startIndex = query.page ? (query.page - 1) * searchResultsPerPage : 0;

    let publishingState = queryToString(
        "publishingState",
        query.publishingState
    );

    let queryArr = flatten([
        keywords,
        dateFroms,
        dateTos,
        publishers,
        formats,
        locations,
        "start=" + startIndex,
        "limit=" + (searchResultsPerPage + 1), // we get one more than we need so we can see what the score of the item at the top of the next page is
        publishingState
    ]);

    return queryArr.join("&");
}

function queryToString(paramName, paramValue) {
    if (!defined(paramValue)) return [];

    if (Array.isArray(paramValue)) {
        return flatten(
            paramValue.map((value) => queryToString(paramName, value))
        );
    } else {
        return [`${paramName}=${encodeURIComponent(paramValue)}`];
    }
}

function queryToLocation(regionId, regiontype) {
    if (!defined(regionId) || !defined(regiontype)) return undefined;
    return `${regiontype}:${regionId}`;
}

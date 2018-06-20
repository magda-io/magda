// @flow
import defined from "./defined";
import { config } from "../config";
import flatten from "lodash.flatten";

type Query = {
    q: string,
    dateFrom: string,
    dateTo: string,
    organisation: string | Array<string>,
    format: string | Array<string>,
    regionId: string,
    regionType: string,
    page: number
};

export default function(query: Query) {
    let keywords = queryToString("query", query.q);
    let dateFroms = queryToString("dateFrom", query.dateFrom);
    let dateTos = queryToString("dateTo", query.dateTo);
    // when we send query to server, organisation is changed to 'publisher'
    let organisations = queryToString(
        "publisher",
        query.organisation || query.organisation
    );
    let formats = queryToString("format", query.format);
    let locations = queryToString(
        "region",
        queryToLocation(query.regionId, query.regionType)
    );
    let startIndex = defined(query.page)
        ? (query.page - 1) * config.resultsPerPage
        : 0;

    let queryArr = flatten([
        keywords,
        dateFroms,
        dateTos,
        organisations,
        formats,
        locations,
        "start=" + startIndex,
        "limit=" + config.resultsPerPage
    ]);

    return queryArr.join("&");
}

function queryToString(paramName, paramValue) {
    if (!defined(paramValue)) return [];

    if (Array.isArray(paramValue)) {
        return flatten(
            paramValue.map(value => queryToString(paramName, value))
        );
    } else {
        return [`${paramName}=${encodeURIComponent(paramValue)}`];
    }
}

function queryToLocation(regionId, regiontype) {
    if (!defined(regionId) || !defined(regiontype)) return;
    return `${regiontype}:${regionId}`;
}

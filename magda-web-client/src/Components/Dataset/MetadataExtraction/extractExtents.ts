const moment = require("moment-timezone");
import XLSX from "xlsx";
import { uniq } from "lodash";
import { Moment } from "moment-timezone";

/**
 * Extract spatial and temporal extent of spreadsheet files
 */
export function extractExtents(input, output) {
    if (input.workbook) {
        // what if it has multiple sheets?
        const worksheet = input.workbook.Sheets[input.workbook.SheetNames[0]];

        const rows = XLSX.utils.sheet_to_json(worksheet);
        if (rows.length) {
            const headersSet = new Set<string>();
            for (let row of rows) {
                for (let key of Object.keys(row as object)) {
                    headersSet.add(key);
                }
            }

            const headers: string[] = [];
            for (let header of headersSet) {
                headers.push(header);
            }

            output.temporalCoverage = {
                intervals: aggregateDates(rows, headers)
            };
            output.spatialCoverage = calculateSpatialExtent(rows, headers);
        }
    }
}

const DATE_REGEX_PART = ".*(date|dt|year|decade).*";
const DATE_REGEX = new RegExp(DATE_REGEX_PART, "i");
const START_DATE_REGEX = new RegExp(".*(start|st)" + DATE_REGEX_PART, "i");
const END_DATE_REGEX = new RegExp(".*(end)" + DATE_REGEX_PART, "i");

const DATE_FORMAT = 'YYYY-MM-DD';

const maxDate: Moment = moment.tz(new Date(8640000000000000), 'UTC');
const minDate: Moment = moment.tz(new Date(-8640000000000000), 'UTC');

const buildSpatialRegex = (part: string) =>
    new RegExp(`.*(${part})($|[^a-z^A-Z])+.*`, "i");

const LONG_REGEX = buildSpatialRegex("long|lng|longitude");
const LAT_REGEX = buildSpatialRegex("lat|latitude|lt");

const MAX_POSSIBLE_LAT = 90;
const MIN_POSSIBLE_LAT = -90;
const MAX_POSSIBLE_LNG = 360;
const MIN_POSSIBLE_LNG = -360;

function tryFilterHeaders(headers: string[], ...regexes: RegExp[]) {
    for (const thisRegex of regexes) {
        const matchingHeaders = headers.filter(header =>
            thisRegex.test(header)
        );

        if (matchingHeaders.length > 0) {
            return matchingHeaders;
        }
    }

    return [];
}

function getBetterLatLng(
    rawLatLng: string,
    toCompare: number,
    min: number,
    max: number,
    getBetter: (number1: number, number2: number) => number
) {
    const parsed: number = Number.parseFloat(rawLatLng);

    if (parsed && !isNaN(parsed) && parsed >= min && parsed <= max) {
        return getBetter(parsed, toCompare);
    } else {
        return toCompare;
    }
}

type SpatialExtent = {
    minLat: number;
    maxLat: number;
    minLng: number;
    maxLng: number;
};

function aggregateDates(rows: any[], headers: string[]) {
    const dateHeaders = tryFilterHeaders(headers, DATE_REGEX);
    const startDateHeaders = uniq(tryFilterHeaders(headers, START_DATE_REGEX));
    const endDateHeaders = uniq(tryFilterHeaders(headers, END_DATE_REGEX));

    const startDateHeadersInOrder = uniq(
        startDateHeaders.concat(dateHeaders).concat(endDateHeaders)
    );

    const endDateHeadersInOrder = uniq(
        endDateHeaders.concat(dateHeaders).concat(startDateHeaders)
    );

    let earliestDate = maxDate;
    let latestDate = minDate;

    startDateHeadersInOrder.forEach((header) => {
        rows.forEach((row) => {
            var dateStr: string = row[header].toString();
            var parsedDate: Moment = moment.tz(dateStr, 'utc');
            if(parsedDate) {
                if(parsedDate.isBefore(earliestDate)) {
                    // Updating the current earliest date
                    earliestDate = parsedDate;
                }
            }
        })
    })

    endDateHeadersInOrder.forEach((header) => {
        rows.forEach((row) => {
            var dateStr: string = row[header].toString();
            var parsedDate: Moment = moment.tz(dateStr, 'utc');
            if(parsedDate) {
                if(parsedDate.isAfter(latestDate)) {
                    // Updating the current latest date
                    latestDate = parsedDate;
                }
            }
        })
    })

    const foundEarliest = !minDate.isSame(earliestDate);
    const foundLatest = !maxDate.isSame(latestDate);

    if (foundEarliest || foundLatest) {
        return {
            start:
                (foundEarliest && earliestDate.format(DATE_FORMAT)) || undefined,
            end:
                (foundLatest && latestDate.format(DATE_FORMAT)) || undefined
        };
    } else {
        return undefined;
    }
}

function calculateSpatialExtent(rows: any[], headers: string[]) {
    const latHeaders = tryFilterHeaders(headers, LAT_REGEX);
    const longHeaders = tryFilterHeaders(headers, LONG_REGEX);

    console.log("Longitude Headers: " + JSON.stringify(longHeaders));
    console.log("Latitude Headers: " + JSON.stringify(latHeaders));

    const spatial = rows.reduce(
        (soFar: SpatialExtent, row: any) => {
            const getBestCoordinateComponent = (
                min: number,
                max: number,
                fn: (number1: number, number2: number) => number
            ) => (bestNumberSoFar: number, header: string) => {
                return getBetterLatLng(
                    row[header],
                    bestNumberSoFar,
                    min,
                    max,
                    fn
                );
            };

            return {
                maxLat: latHeaders.reduce(
                    getBestCoordinateComponent(
                        MIN_POSSIBLE_LAT,
                        MAX_POSSIBLE_LAT,
                        Math.max
                    ),
                    soFar.maxLat
                ),
                minLat: latHeaders.reduce(
                    getBestCoordinateComponent(
                        MIN_POSSIBLE_LAT,
                        MAX_POSSIBLE_LAT,
                        Math.min
                    ),
                    soFar.minLat
                ),
                maxLng: longHeaders.reduce(
                    getBestCoordinateComponent(
                        MIN_POSSIBLE_LNG,
                        MAX_POSSIBLE_LNG,
                        Math.max
                    ),
                    soFar.maxLng
                ),
                minLng: longHeaders.reduce(
                    getBestCoordinateComponent(
                        MIN_POSSIBLE_LNG,
                        MAX_POSSIBLE_LNG,
                        Math.min
                    ),
                    soFar.minLng
                )
            };
        },
        {
            maxLat: Number.MIN_SAFE_INTEGER,
            minLat: Number.MAX_SAFE_INTEGER,
            maxLng: Number.MIN_SAFE_INTEGER,
            minLng: Number.MAX_SAFE_INTEGER
        } as SpatialExtent
    );

    console.log(`Longitude: ${spatial.minLng} to ${spatial.maxLng}`);
    console.log(`Latitude: ${spatial.minLat} to ${spatial.maxLat}`);

    if (
        spatial.maxLat !== Number.MIN_SAFE_INTEGER &&
        spatial.minLat !== Number.MAX_SAFE_INTEGER &&
        spatial.maxLng !== Number.MIN_SAFE_INTEGER &&
        spatial.minLng !== Number.MAX_SAFE_INTEGER
    ) {
        return {
            spatialDataInputMethod: "bbox",
            bbox: [
                spatial.minLng,
                spatial.minLat,
                spatial.maxLng,
                spatial.maxLat
            ]
        };
    } else {
        return {};
    }
}

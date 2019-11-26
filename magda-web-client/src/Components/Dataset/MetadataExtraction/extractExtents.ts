const moment = require("moment");
import XLSX from "xlsx";

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
                intervals: [aggregateDates(rows, headers)].filter(i => i)
            };
            output.spatialCoverage = calculateSpatialExtent(rows, headers);
        }
    }
}

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
    let moments = rows.map(d => moment(d));
    const earliestStart = moment.min(moments).toDate();
    const latestEnd = moment.max(moments).toDate();

    const earliestNotFound = earliestStart.toString() === "Invalid Date";
    const latestNotFound = latestEnd.toString() === "Invalid Date";

    if (!earliestNotFound || !latestNotFound) {
        return {
            start:
                (!earliestNotFound &&
                    earliestStart.toISOString().substr(0, 10)) ||
                undefined,
            end:
                (!latestNotFound && latestEnd.toISOString().substr(0, 10)) ||
                undefined
        };
    } else {
        return undefined;
    }
}

function getGreater(num1: number, num2: number) {
    return num1 > num2 ? num1 : num2;
}

function getSmaller(num1: number, num2: number) {
    return num1 <= num2 ? num1 : num2;
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
                        getGreater
                    ),
                    soFar.maxLat
                ),
                minLat: latHeaders.reduce(
                    getBestCoordinateComponent(
                        MIN_POSSIBLE_LAT,
                        MAX_POSSIBLE_LAT,
                        getSmaller
                    ),
                    soFar.minLat
                ),
                maxLng: longHeaders.reduce(
                    getBestCoordinateComponent(
                        MIN_POSSIBLE_LNG,
                        MAX_POSSIBLE_LNG,
                        getGreater
                    ),
                    soFar.maxLng
                ),
                minLng: longHeaders.reduce(
                    getBestCoordinateComponent(
                        MIN_POSSIBLE_LNG,
                        MAX_POSSIBLE_LNG,
                        getSmaller
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

import moment, { Moment } from "moment";
import XLSX from "xlsx";
import { uniq } from "lodash";
import { FileDetails, ExtractedContents } from "./types";
import {
    SpatialCoverage,
    TemporalCoverage,
    Interval
} from "../Add/DatasetAddCommon";
import type { MessageSafeConfig } from "config";

/**
 * Extract spatial and temporal extent of spreadsheet files
 */
export function extractExtents(
    _input: FileDetails,
    _array: Uint8Array,
    depInput: ExtractedContents,
    config: MessageSafeConfig
): Promise<{
    temporalCoverage?: TemporalCoverage;
    spatialCoverage?: SpatialCoverage;
}> {
    if (depInput.workbook) {
        // what if it has multiple sheets?
        const worksheet =
            depInput.workbook.Sheets[depInput.workbook.SheetNames[0]];

        let temporalCoverage: TemporalCoverage | undefined;
        let spatialCoverage: SpatialCoverage | undefined;
        const rows = XLSX.utils.sheet_to_json(worksheet, { raw: true });
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

            temporalCoverage = {
                intervals: [aggregateDates(rows, headers, config)].filter(
                    (i): i is Interval => !!i
                )
            };
            spatialCoverage = calculateSpatialExtent(rows, headers);
        }

        return Promise.resolve({ temporalCoverage, spatialCoverage });
    } else {
        return Promise.resolve({});
    }
}

const maxDate: Moment = moment(new Date(8640000000000000));
const minDate: Moment = moment(new Date(-8640000000000000));

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
        const matchingHeaders = headers.filter((header) =>
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

function findDateHeadersFromRow(data: { [key: string]: any }): string[] {
    if (!data) {
        return [];
    }
    const headers = Object.keys(data);
    if (!headers?.length) {
        return [];
    }
    return headers.filter((key) => {
        const str = data[key];
        if (!str) {
            return false;
        }
        if (typeof str !== "string") {
            return false;
        }
        return (
            Object.values(moment.HTML5_FMT).findIndex((format) =>
                moment(data[key], format, true).isValid()
            ) !== -1
        );
    });
}

function aggregateDates(
    rows: any[],
    headers: string[],
    config: MessageSafeConfig
): Interval | undefined {
    const { dateFormats, dateRegexes } = config.dateConfig;
    const { dateRegex, startDateRegex, endDateRegex } = dateRegexes;

    const dateHeaders = uniq(
        tryFilterHeaders(headers, dateRegex).concat(
            findDateHeadersFromRow(rows?.length ? rows[0] : [])
        )
    );
    const startDateHeaders = uniq(tryFilterHeaders(headers, startDateRegex));
    const endDateHeaders = uniq(tryFilterHeaders(headers, endDateRegex));

    const startDateHeadersInOrder = uniq(
        startDateHeaders.concat(dateHeaders).concat(endDateHeaders)
    );

    const endDateHeadersInOrder = uniq(
        endDateHeaders.concat(dateHeaders).concat(startDateHeaders)
    );

    let earliestDate = maxDate;
    let latestDate = minDate;

    rows.forEach((row) => {
        startDateHeadersInOrder.forEach((header) => {
            if (!row[header]) {
                return;
            }
            const dateStr: string = row[header].toString();
            const parsedDate: Moment = moment(dateStr, dateFormats, true);
            if (parsedDate) {
                if (parsedDate.isBefore(earliestDate)) {
                    // Updating the current earliest date
                    earliestDate = parsedDate;
                }
            }
        });

        endDateHeadersInOrder.forEach((header) => {
            if (!row[header]) {
                return;
            }
            const dateStr: string = row[header].toString();
            const parsedDate: Moment = moment(dateStr, dateFormats, true);
            if (parsedDate) {
                let extendedTime = extendIncompleteTime(parsedDate.clone());
                if (extendedTime.isAfter(latestDate)) {
                    // Updating the current latest date
                    latestDate = extendedTime;
                }
            }
        });
    });

    const foundEarliest = !maxDate.isSame(earliestDate);
    const foundLatest = !minDate.isSame(latestDate);

    if (foundEarliest || foundLatest) {
        return {
            start: (foundEarliest && earliestDate.toDate()) || undefined,
            end: (foundLatest && latestDate.toDate()) || undefined
        };
    } else {
        return undefined;
    }
}

/**
 *
 * @param m Extends an incomplete date to it's latest extent. For example, 2014 is 2014-12-31, 2014-05 is 2014-05-31
 */
function extendIncompleteTime(m: Moment): Moment {
    const originalMoment = m.clone();
    const creationData = m.creationData();
    // YYYY, unless the original date was the very start of the year
    if (
        creationData.format === "YYYY" &&
        originalMoment.isSame(m.startOf("year"))
    ) {
        return originalMoment.endOf("year");
    }

    // YYYY-MM, unless the original date was the very start of the month
    if (
        originalMoment.date() !== 0 &&
        originalMoment.isSame(m.startOf("month"))
    ) {
        return originalMoment.endOf("month");
    }

    // If it was more precise than YYYY or YYYY-MM
    return originalMoment;
}

function calculateSpatialExtent(
    rows: any[],
    headers: string[]
): SpatialCoverage | undefined {
    const latHeaders = tryFilterHeaders(headers, LAT_REGEX);
    const longHeaders = tryFilterHeaders(headers, LONG_REGEX);

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
        return undefined;
    }
}

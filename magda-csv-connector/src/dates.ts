import * as fuzzy from "./fuzzyMatch";

// https://stackoverflow.com/questions/1353684/detecting-an-invalid-date-date-instance-in-javascript
export function isValidDate(date: Date) {
    return date instanceof Date && !isNaN(date.getTime());
}

// convert random date string into proper iso 8601 format
export function formatDateTime(dateStr: string): string {
    // lets get this out of the way
    if (!dateStr) {
        return undefined;
    }

    let dateStrProcessed = dateStr;

    // if we dont have some sort of anchor, parsed date will be
    // different based on the machine it is run in

    if (!dateStrProcessed.match(/(gmt|[+z])/gi)) {
        dateStrProcessed += " GMT";
    }

    let date = new Date(dateStrProcessed);

    // if that wasn't a date
    if (!isValidDate(date)) {
        return undefined;
    }

    let output = date.toISOString();

    let outputSimilarity = fuzzy.similarity(output, dateStr);

    let alternateOutput = output.substr(0, 10),
        alternateOutputSimilarity = fuzzy.similarity(alternateOutput, dateStr);

    // was it a shorter date? there is no point including time bits
    if (alternateOutputSimilarity > outputSimilarity) {
        output = alternateOutput;
        outputSimilarity = alternateOutputSimilarity;
    }

    if (outputSimilarity < DATE_SIMILARITY_THRESHOLD_EPSILON) {
        console.log(`ERROR: This is definitely not a date! "${dateStr}"`);
        return undefined;
    }

    return output;
}

const DATE_SIMILARITY_THRESHOLD_EPSILON: number = 1e-2;

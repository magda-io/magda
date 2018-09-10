const stringSimilarity = require("string-similarity");

/**
 * asdasd
 */
export function findClosestField(
    row: { [name: string]: string },
    ...targets: string[]
): string {
    const fields = Object.keys(row);
    const bestMatch = targets
        .map(target => stringSimilarity.findBestMatch(target, fields))
        .sort((a, b) => b.bestMatch.rating - a.bestMatch.rating)[0];
    return row[bestMatch.bestMatch.target];
}

export function findClosestFieldThreshold(
    row: { [name: string]: string },
    minimumScore: number,
    ...targets: string[]
): string {
    const fields = Object.keys(row);
    const bestMatch = targets
        .map(target => stringSimilarity.findBestMatch(target, fields))
        .sort((a, b) => b.bestMatch.rating - a.bestMatch.rating)[0];
    // console.log(
    //     targets.join(",") + "|" + bestMatch.bestMatch.target,
    //     bestMatch.bestMatch.rating,
    //     minimumScore
    // );
    if (bestMatch.bestMatch.rating >= minimumScore) {
        return row[bestMatch.bestMatch.target];
    } else {
        return undefined;
    }
}

/**
 * asdasd
 */
export function similarity(target: string, ...options: string[]): number {
    return Math.min(
        ...options.map(option =>
            stringSimilarity.compareTwoStrings(target, option)
        )
    );
}

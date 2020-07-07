import { Distribution } from "Components/Dataset/Add/DatasetAddCommon";

/**
 * Merge all modified date field of existing distributions to determine dataset modified date
 * Optionally merge with existingModifiedData
 *
 * @export
 * @param {Distribution[]} dists
 * @param {Date} [existingModifiedData] Optional
 * @returns {(Date | undefined)}
 */
export default function mergeDistModifiedDate(
    dists: Distribution[],
    existingModifiedData?: Date
): Date | undefined {
    const modifiedDates = dists
        .filter((dist) => dist.modified)
        .map((dist) =>
            dist.modified instanceof Date
                ? dist.modified
                : new Date(dist.modified)
        )
        .filter((dist) => !isNaN(dist.getTime()))
        .map((dist) => dist.getTime())
        .concat(
            // --- optionally merge with existing modified data
            existingModifiedData?.getTime &&
                !isNaN(existingModifiedData.getTime())
                ? [existingModifiedData.getTime()]
                : []
        )
        .sort((a, b) => b - a);

    // --- return the `latest` date as new suggested modified date
    return modifiedDates.length ? new Date(modifiedDates[0]) : undefined;
}

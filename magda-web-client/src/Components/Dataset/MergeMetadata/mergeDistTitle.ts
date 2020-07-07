import { Distribution } from "Components/Dataset/Add/DatasetAddCommon";

/**
 * Merge all datasetTitle field of existing distributions to determine dataset title
 * Optionally provide existingTitle parameter to merge with existingTitle
 *
 * @export
 * @param {Distribution[]} dists
 * @param {string} [existingTitle] Optional
 * @returns {(string | undefined)}
 */
export default function mergeDistTitle(
    dists: Distribution[],
    existingTitle?: string
): string | undefined {
    if (existingTitle?.trim && existingTitle.trim()) {
        // --- when existing title not empty, return existing title right away
        return existingTitle;
    }

    let newTitle;
    dists.forEach((item) => {
        if (
            item?.datasetTitle &&
            typeof item.datasetTitle === "string" &&
            item.datasetTitle.trim()
        ) {
            newTitle = item.datasetTitle.trim();
        }
    });
    if (newTitle) {
        return newTitle;
    } else {
        return;
    }
}

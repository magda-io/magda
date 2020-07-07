import { Distribution } from "Components/Dataset/Add/DatasetAddCommon";

/**
 * Merge all datasetTitle field of existing distributions to determine dataset title
 *
 * @export
 * @param {Distribution[]} dists
 * @returns {(string | undefined)}
 */
export default function mergeDistTitle(
    dists: Distribution[]
): string | undefined {
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

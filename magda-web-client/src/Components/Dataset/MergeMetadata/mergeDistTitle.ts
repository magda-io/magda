import { State } from "Components/Dataset/Add/DatasetAddCommon";

/**
 * Merge all datasetTitle field of existing distributions to determine dataset title
 *
 * @export
 * @param {State} state
 * @returns {(string | undefined)}
 */
export default function mergeDistTitle(state: State): string | undefined {
    const newDists = state.distributions.filter(
        (item) => item.isReplacementComfired === false
    );
    let newTitle;
    newDists.forEach((item) => {
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

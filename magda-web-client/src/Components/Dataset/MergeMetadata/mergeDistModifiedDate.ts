import { State } from "Components/Dataset/Add/DatasetAddCommon";

/**
 * Merge all modified date field of existing distributions to determine dataset modified date
 *
 * @export
 * @param {State} state
 * @returns {(Date | undefined)}
 */
export default function mergeDistModifiedDate(state: State): Date | undefined {
    const newDists = state.distributions.filter(
        (item) => item.isReplacementComfired === false
    );
    const modifiedDateList: Date[] = [];
    newDists.forEach((item) => {
        if (item?.modified?.getTime!) {
            modifiedDateList.push(item.modified);
        }
    });
    if (!modifiedDateList.length) {
        return;
    }
    // --- return the `latest` date as new suggested modified date
    modifiedDateList.sort((a, b) => b.getTime() - a.getTime());
    return modifiedDateList[0];
}

import { Distribution } from "Components/Dataset/Add/DatasetAddCommon";

/**
 * Merge all issue date field of existing distributions to determine dataset issue date
 *
 * @export
 * @param {Distribution[]} dists
 * @returns {(Date | undefined)}
 */
export default function mergeDistIssueDate(
    dists: Distribution[]
): Date | undefined {
    const issueDateList: Date[] = [];
    dists.forEach((item) => {
        if (item?.issued?.getTime) {
            issueDateList.push(item.issued);
        }
    });
    if (!issueDateList.length) {
        return;
    }
    // --- return the `easiest` date as new suggested issue date
    issueDateList.sort((a, b) => a.getTime() - b.getTime());
    return issueDateList[0];
}

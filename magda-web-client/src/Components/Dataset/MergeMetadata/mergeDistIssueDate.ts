import { Distribution } from "Components/Dataset/Add/DatasetAddCommon";

/**
 * Merge all issue date field of existing distributions to determine dataset issue date
 * Optionally merge with existingIssueDate
 *
 * @export
 * @param {Distribution[]} dists
 * @param {Date} [existingIssueDate] Optional
 * @returns {(Date | undefined)}
 */
export default function mergeDistIssueDate(
    dists: Distribution[],
    existingIssueDate?: Date
): Date | undefined {
    const issueDateList: Date[] = [];

    if (existingIssueDate?.getTime && !isNaN(existingIssueDate.getTime())) {
        issueDateList.push(existingIssueDate);
    }

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

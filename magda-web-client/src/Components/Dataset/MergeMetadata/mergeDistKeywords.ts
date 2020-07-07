import uniqBy from "lodash/uniqBy";
import { Distribution } from "Components/Dataset/Add/DatasetAddCommon";

/**
 * Merge all keywords field of existing distributions to determine dataset keywords
 *
 * @export
 * @param {Distribution[]} dists
 * @returns {(string[] | undefined)}
 */
export default function mergeDistKeywords(
    dists: Distribution[]
): string[] | undefined {
    let keywords: string[] = [];
    dists.forEach((item) => {
        if (item?.keywords?.length) {
            keywords = keywords.concat(item.keywords);
        }
    });
    if (!keywords.length) {
        return;
    }
    keywords = uniqBy(keywords, (item) => item.toLowerCase().trim());
    return keywords;
}

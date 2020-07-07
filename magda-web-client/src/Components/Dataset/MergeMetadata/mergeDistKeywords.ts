import uniqBy from "lodash/uniqBy";
import { State } from "Components/Dataset/Add/DatasetAddCommon";

/**
 * Merge all keywords field of existing distributions to determine dataset keywords
 *
 * @export
 * @param {State} state
 * @returns {(string[] | undefined)}
 */
export default function mergeDistKeywords(state: State): string[] | undefined {
    const newDists = state.distributions.filter(
        (item) => item.isReplacementComfired === false
    );
    let keywords: string[] = [];
    newDists.forEach((item) => {
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

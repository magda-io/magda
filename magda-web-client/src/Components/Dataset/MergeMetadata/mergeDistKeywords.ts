import uniqBy from "lodash/uniqBy";
import {
    Distribution,
    KeywordsLike
} from "Components/Dataset/Add/DatasetAddCommon";

/**
 * Merge all keywords field of existing distributions to determine dataset keywords
 * Optionally merge with existingKeywords
 *
 * @export
 * @param {Distribution[]} dists
 * @param {KeywordsLike} [existingKeywords] Optional
 * @param {KeywordsLike} [mergeThemes] Optional when true, distribution.themes will be used for merging
 * @returns {(KeywordsLike | undefined)}
 */
export default function mergeDistKeywords(
    dists: Distribution[],
    existingKeywords?: KeywordsLike,
    mergeThemes?: boolean
): KeywordsLike | undefined {
    mergeThemes = typeof mergeThemes === "boolean" ? mergeThemes : false;
    const mergeField = mergeThemes === true ? "themes " : "keywords";

    let keywords: string[] = [];

    dists.forEach((item) => {
        if (item?.[mergeField]?.length) {
            keywords = keywords.concat(item[mergeField]);
        }
    });

    const derived = keywords.length ? true : false;

    if (existingKeywords?.keywords?.length) {
        keywords = keywords.concat(existingKeywords.keywords);
    }

    if (!keywords.length) {
        return;
    }

    keywords = uniqBy(keywords, (item) => item.toLowerCase().trim());

    return {
        keywords,
        derived: derived || existingKeywords?.derived === true
    };
}

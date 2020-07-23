import {
    Distribution,
    KeywordsLike
} from "Components/Dataset/Add/DatasetAddCommon";
import { config } from "config";

import mergeDistKeywords from "./mergeDistKeywords";

/**
 * Merge all themes field of existing distributions to determine dataset themes
 * Optionally merge with existingThemes
 *
 * @export
 * @param {Distribution[]} dists
 * @param {KeywordsLike} [existingThemes] Optional
 * @returns {(KeywordsLike | undefined)}
 */
export default function mergeDistThemes(
    dists: Distribution[],
    existingThemes?: KeywordsLike,
    existingKeywords?: KeywordsLike
): KeywordsLike | undefined {
    const mergedThemes = mergeDistKeywords(dists, existingThemes, true);
    const mergedKeywords = mergeDistKeywords(dists, existingKeywords);

    if (config?.datasetThemes?.length && mergedKeywords?.keywords?.length) {
        const keywords = mergedKeywords.keywords.map((item) =>
            item.toLowerCase().trim()
        );

        const themesBasedOnKeywords = config.datasetThemes.filter(
            (theme) => keywords.indexOf(theme.toLowerCase().trim()) !== -1
        );

        if (themesBasedOnKeywords.length) {
            const existingThemesKeywords = mergedThemes?.keywords?.length
                ? mergedThemes.keywords
                : [];

            return {
                keywords: themesBasedOnKeywords.concat(existingThemesKeywords),
                derived: true
            };
        } else {
            return mergedThemes;
        }
    } else {
        return mergedThemes;
    }
}

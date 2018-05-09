import jsc from "@magda/typescript-common/dist/test/jsverify";
import {
    fuzzStringArbResult,
    arbFlatMap,
    distStringsArb,
    recordArbWithDists,
    stringArb
} from "@magda/typescript-common/dist/test/arbitraries";
import openLicenses from "../openLicenses";
import openFormats from "../openFormats";
import { ZERO_STAR_LICENSES } from "./examples";
import { Record } from "@magda/typescript-common/dist/generated/registry/api";
import * as _ from "lodash";

/** Generates strings with the words of open licenses embedded in them */
export const openLicenseArb = fuzzStringArbResult(jsc.elements(openLicenses));

/**
 *  Regex containing all possible format words with a lookahead to allow overlap,
 *  as per https://stackoverflow.com/questions/20833295/how-can-i-match-overlapping-strings-with-regex
 */
const allFormatWords = new RegExp(
    "(?=(" +
        _(openFormats)
            .values()
            .flatten()
            .flatMap((format: string) => format.split(" "))
            .join("|") +
        ")).",
    "ig"
);

/**
 * Generates a format string that will match the desired star count.
 */
export const formatArb = (starCount: number): jsc.Arbitrary<string> => {
    if (starCount === 0 || starCount === 1) {
        return jsc.elements(["oaeirjga", "geragcre", "blerghgrr"]);
    } else {
        const innerArb = fuzzStringArbResult(
            jsc.elements(openFormats[starCount]),
            stringArb
        );

        return jsc.suchthat(innerArb, string => {
            let i = 0;

            while (allFormatWords.exec(string) != null) {
                i++;
            }

            return i <= 1;
        });
    }
};

/**
 * Generates a record with at least one distribution that will qualify
 * for the desired number of stars.
 */
export function recordForHighestStarCountArb(
    highestStarCount: number
): jsc.Arbitrary<Record> {
    const getForStarCount = (forStars: number) => {
        const license =
            forStars === 0 ? jsc.elements(ZERO_STAR_LICENSES) : openLicenseArb;

        return jsc.record({
            starCount: jsc.constant(forStars),
            dist: distStringsArb({
                license: license,
                format: formatArb(forStars)
            })
        });
    };

    const starRatingArb = jsc.suchthat(
        jsc.nearray(jsc.integer(0, highestStarCount)),
        starRatings =>
            starRatings.some(starRating => starRating === highestStarCount)
    );

    return arbFlatMap(
        starRatingArb,
        stars => jsc.tuple(stars.map(getForStarCount)),
        result => result.map(inner => inner.starCount)
    ).flatMap(
        (x: { dist: object }[]) => {
            const dists = x.map(({ dist }) => dist);
            return recordArbWithDists(dists);
        },
        record => {
            return record.aspects["dataset-distributions"].distributions.map(
                (dist: Record) => dist.aspects["dcat-distribution-strings"]
            );
        }
    );
}

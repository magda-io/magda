import _ from "lodash";

import { Record } from "magda-typescript-common/src/generated/registry/api";
import unionToThrowable from "magda-typescript-common/src/util/unionToThrowable";
import AuthorizedRegistryClient from "magda-typescript-common/src/registry/AuthorizedRegistryClient";
import linkedDataAspectDef from "./linkedDataAspectDef";
import datasetQualityAspectDef from "magda-minion-framework/src/common-aspect-defs/datasetQualityAspectDef";
import openLicenses from "./openLicenses";
import formatStars from "./openFormats";

const openLicenseRegex = stringsToRegex(openLicenses);
const openFormatRegexes = _(formatStars)
    .mapValues(stringsToRegex)
    .toPairs<RegExp>()
    .map(
        ([starCount, regex]) => [parseInt(starCount), regex] as [number, RegExp]
    )
    .sortBy(([starCount, regex]) => -1 * starCount)
    .value();

export default async function onRecordFound(
    record: Record,
    registry: AuthorizedRegistryClient
) {
    const theTenantId = record.tenantId;

    const distributions = _(
        record.aspects["dataset-distributions"]
            ? record.aspects["dataset-distributions"].distributions
            : []
    )
        .flatMap((distribution: Record) => distribution.aspects)
        .map((aspect: any) => ({
            distStrings: aspect["dcat-distribution-strings"],
            sourceLink: aspect["source-link-status"],
            datasetFormat: aspect["dataset-format"]
        }))
        .value();

    const processed = distributions.map(distribution => {
        if (
            distribution.sourceLink &&
            distribution.sourceLink.status == "broken"
        ) {
            return 0;
        }

        const isLicenseOpen = isOpenLicense(distribution.distStrings.license);

        if (isLicenseOpen) {
            const format = _.get(
                distribution,
                "datasetFormat.format",
                distribution.distStrings.format
            );
            return Math.max(starsForFormat(format), 1);
        } else {
            return 0;
        }
    });

    const best = _.max(processed) || 0;

    const starsAspectPromise = registry
        .putRecordAspect(
            record.id,
            linkedDataAspectDef.id,
            {
                stars: best || 0
            },
            theTenantId
        )
        .then(result => unionToThrowable(result));

    const qualityPromise = registry
        .putRecordAspect(
            record.id,
            datasetQualityAspectDef.id,
            {
                [linkedDataAspectDef.id]: {
                    score: best / 5,
                    weighting: 1
                }
            },
            theTenantId
        )
        .then(result => unionToThrowable(result));

    return Promise.all([starsAspectPromise, qualityPromise]).then(() => {});
}

function isOpenLicense(license: string): boolean {
    return openLicenseRegex.test(license);
}

function starsForFormat(format: string): number {
    const starRatingForFormat = _(openFormatRegexes)
        .filter(([starCount, regex]) => regex.test(format))
        .map(([starCount, regex]) => starCount)
        .first();

    return starRatingForFormat || 0;
}

function stringsToRegex(array: string[]): RegExp {
    function regexIfy(string: string) {
        return string.replace(/[^a-zA-Z\d]/g, "[\\s\\S]*");
    }

    return new RegExp(array.map(regexIfy).join("|"), "i");
}

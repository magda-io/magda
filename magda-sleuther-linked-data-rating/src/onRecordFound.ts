import * as _ from "lodash";

import { Record } from "@magda/typescript-common/dist/generated/registry/api";
import unionToThrowable from "@magda/typescript-common/dist/util/unionToThrowable";
import AuthorizedRegistryClient from "@magda/typescript-common/dist/registry/AuthorizedRegistryClient";
import linkedDataAspectDef from "./linkedDataAspectDef";
import datasetQualityAspectDef from "@magda/sleuther-framework/dist/common-aspect-defs/datasetQualityAspectDef";
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
    const distributions = _(
        record.aspects["dataset-distributions"]
            ? record.aspects["dataset-distributions"].distributions
            : []
    )
        .flatMap((distribution: Record) => distribution.aspects)
        .flatMap((aspect: any) => aspect["dcat-distribution-strings"])
        .value();

    const processed = distributions.map(distribution => {
        const isLicenseOpen = isOpenLicense(distribution.license);

        if (isLicenseOpen) {
            return Math.max(starsForFormat(distribution.format), 1);
        } else {
            return 0;
        }
    });

    const best = _.max(processed) || 0;

    const starsAspectPromise = registry
        .putRecordAspect(record.id, linkedDataAspectDef.id, {
            stars: best || 0
        })
        .then(result => unionToThrowable(result));

    const op = {
        op: "add",
        path: "/" + linkedDataAspectDef.id,
        value: {
            score: best / 5,
            weighting: 0.8
        }
    };

    const qualityPromise = registry
        .patchRecordAspect(record.id, datasetQualityAspectDef.id, [op])
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

import jsc from "@magda/typescript-common/dist/test/jsverify";
import { Record } from "@magda/typescript-common/dist/generated/registry/api";
import {
    distUrlArb,
    arrayOfSizeArb,
    arbFlatMap,
    recordArbWithDistArbs
} from "@magda/typescript-common/dist/test/arbitraries";
import urlsFromDataSet from "./urlsFromDataSet";
import * as _ from "lodash";
import * as URI from "urijs";

export const KNOWN_PROTOCOLS = ["https", "http", "ftp"];

const defaultRecordArb = recordArbWithDistArbs({ url: distUrlArb() });

/**
 * Generates a record along with a map of every distribution URL to whether
 * or not it should successfully return.
 */
export const recordArbWithSuccesses = arbFlatMap(
    defaultRecordArb,
    (record: Record) => {
        const getKnownProtocolUrls = (record: Record) =>
            _(urlsFromDataSet(record))
                .filter(url => KNOWN_PROTOCOLS.indexOf(URI(url).scheme()) >= 0)
                .uniq()
                .value();

        const urls = getKnownProtocolUrls(record);

        const gen: jsc.Arbitrary<CheckResult[]> = arrayOfSizeArb(
            urls.length,
            checkResultArb
        );

        return gen.smap(
            successfulArr => {
                const successes = urls.reduce(
                    (soFar, current, index) => {
                        soFar[current] = successfulArr[index];
                        return soFar;
                    },
                    {} as { [a: string]: CheckResult }
                );

                return { record, successes };
            },
            ({ record, successes }) => {
                return getKnownProtocolUrls(record).map(url => successes[url]);
            }
        );
    },
    ({ record, successes }) => record
);

export type CheckResult = "success" | "error" | "notfound";
export const checkResultArb: jsc.Arbitrary<CheckResult> = jsc.oneof(
    ["success" as "success", "error" as "error", "notfound" as "notfound"].map(
        jsc.constant
    )
);

/**
 * Record arbitrary that only generates datasets with HTTP or HTTPS urls, with
 * at least one distribution per dataset and with at least one valid url per
 * distribution, for testing retries.
 */
export const httpOnlyRecordArb = jsc.suchthat(
    recordArbWithDistArbs(
        jsc.oneof([
            jsc.constant(undefined),
            distUrlArb({
                schemeArb: jsc.oneof([
                    jsc.constant("http"),
                    jsc.constant("https")
                ])
            })
        ])
    ),
    record =>
        record.aspects["dataset-distributions"].distributions.length > 1 &&
        record.aspects["dataset-distributions"].distributions.every(
            (dist: any) => {
                const aspect = dist.aspects["dcat-distribution-strings"];

                const definedURLs = [
                    aspect.accessURL,
                    aspect.downloadURL
                ].filter(x => !!x);

                return (
                    definedURLs.length > 0 &&
                    definedURLs.every(x => x.startsWith("http"))
                );
            }
        )
);

/**
 * Generates a failing HTTP code at random, excepting 429 because that
 * triggers different behaviour.
 */
export const failureCodeArb = jsc.suchthat(
    jsc.integer(300, 600),
    int => int !== 429
);

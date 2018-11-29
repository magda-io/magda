import jsc from "@magda/typescript-common/dist/test/jsverify";
import { Record } from "@magda/typescript-common/dist/generated/registry/api";
import {
    distUrlArb,
    arrayOfSizeArb,
    arbFlatMap,
    recordArbWithDistArbs,
    stringArb
} from "@magda/typescript-common/dist/test/arbitraries";
import urlsFromDataSet from "./urlsFromDataSet";
import * as _ from "lodash";
import * as URI from "urijs";

export const KNOWN_PROTOCOLS = ["https", "http", "ftp"];

const defaultRecordArb = recordArbWithDistArbs({
    url: jsc.oneof([distUrlArb(), stringArb])
});

/**
 * Generates a record along with a map of every distribution URL to whether
 * or not it should successfully return.
 */
export const recordArbWithSuccesses = arbFlatMap(
    defaultRecordArb,
    (record: Record) => {
        const knownProtocolUrls = getKnownProtocolUrls(record);

        const urlWithSuccessArb: jsc.Arbitrary<CheckResult[]> = arrayOfSizeArb(
            knownProtocolUrls.length,
            checkResultArb
        );

        return urlWithSuccessArb.smap(
            resultArr => {
                const successLookup = knownProtocolUrls.reduce(
                    (soFar, current, index) => {
                        soFar[current] = resultArr[index];
                        return soFar;
                    },
                    {} as { [a: string]: CheckResult }
                );
                // some server configurations will disallow HEAD
                // method requests. When that fails, we try
                // to make a get request to verify the link
                const disallowHead = jsc.bool.generator(0);

                return { record, successLookup, disallowHead };
            },
            ({ record, successLookup }) => {
                return getKnownProtocolUrls(record).map(
                    url => successLookup[url]
                );
            }
        );
    },
    ({ record, successLookup }) => record
);

/**
 * Gets all the urls for distributions in this dataset record that have known protocols (http etc.).
 */
function getKnownProtocolUrls(record: Record) {
    return _(urlsFromDataSet(record))
        .filter(url => {
            let uri;
            try {
                uri = URI(url);
            } catch (e) {
                return false;
            }
            return KNOWN_PROTOCOLS.indexOf(uri.scheme()) >= 0;
        })
        .uniq()
        .value();
}

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

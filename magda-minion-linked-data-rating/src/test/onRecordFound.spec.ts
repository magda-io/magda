import onRecordFound from "../onRecordFound";
import {} from "mocha";
import * as sinon from "sinon";
import * as nock from "nock";
import jsc from "@magda/typescript-common/dist/test/jsverify";
import { Record } from "@magda/typescript-common/dist/generated/registry/api";
import * as _ from "lodash";
import {
    recordArbWithDistArbs,
    stringArb,
    arbFlatMap
} from "@magda/typescript-common/dist/test/arbitraries";
import {
    openLicenseArb,
    formatArb,
    recordForHighestStarCountArb
} from "./arbitraries";
import { encodeURIComponentWithApost } from "@magda/typescript-common/dist/test/util";
import { OKFN_LICENSES, ZERO_STAR_LICENSES, FORMAT_EXAMPLES } from "./examples";
import AuthorizedRegistryClient from "@magda/typescript-common/dist/registry/AuthorizedRegistryClient";

describe("ld rating onRecordFound", function(this: Mocha.ISuiteCallbackContext) {
    this.timeout(10000);
    nock.disableNetConnect();
    const registryUrl = "http://example.com";
    const registry = new AuthorizedRegistryClient({
        baseUrl: registryUrl,
        jwtSecret: "secret",
        userId: "1",
        tenantId: undefined
    });
    let registryScope: nock.Scope;

    before(() => {
        sinon.stub(console, "info");

        nock.emitter.on("no match", onMatchFail);
    });

    const onMatchFail = (req: any) => {
        console.error("Match failure: " + JSON.stringify(req.path));
    };

    after(() => {
        (console.info as any).restore();

        nock.emitter.removeListener("no match", onMatchFail);
    });

    const beforeEachProperty = () => {
        registryScope = nock(registryUrl); //.log(console.log);
    };

    const afterEachProperty = () => {
        registryScope.done();
        nock.cleanAll();
    };
    beforeEach(beforeEachProperty);
    afterEach(afterEachProperty);

    it("should give a dataset with no distributions zero stars", () => {
        const record = buildRecordWithDist();
        expectStarCount({ record, starCount: 0 });

        return onRecordFound(record, registry);
    });

    describe("licenses", () => {
        describe("endorsed by OKFN should get 1 star:", () => {
            OKFN_LICENSES.forEach((license: string) => {
                it(license, () => {
                    const record = buildRecordWithDist({ license });

                    expectStarCount({ record, starCount: 1 });

                    return onRecordFound(record, registry);
                });
            });
        });

        it("should give fuzzily generated open licenses a star", () => {
            return runPropertyTest({
                licenseArb: openLicenseArb,
                formatArb: jsc.constant(undefined),
                beforeTest: (record: Record) => {
                    expectStarCount({ record, starCount: 1 });
                }
            });
        });

        it("should give distribtuions with a broken source-link 0 stars", () => {
            return runPropertyTest({
                recordArb: jsc.suchthat(
                    recordArbWithDistArbs(
                        {
                            license: jsc.oneof([
                                openLicenseArb,
                                jsc.oneof(
                                    ZERO_STAR_LICENSES.map(lic =>
                                        jsc.constant(lic)
                                    )
                                )
                            ]),
                            format: jsc.oneof([
                                formatArb(0),
                                formatArb(1),
                                formatArb(2),
                                formatArb(3),
                                formatArb(4)
                            ])
                        },
                        {
                            status: jsc.constant("broken")
                        },
                        {
                            format: jsc.oneof([
                                formatArb(0),
                                formatArb(1),
                                formatArb(2),
                                formatArb(3),
                                formatArb(4)
                            ])
                        }
                    ),
                    record =>
                        record.aspects["dataset-distributions"].distributions
                            .length > 0
                ),
                beforeTest: (record: Record) => {
                    expectStarCount({ record, starCount: 0 });
                }
            });
        });

        it("should give distribtuions with a active source-link > 0 stars", () => {
            return runPropertyTest({
                recordArb: jsc.suchthat(
                    recordArbWithDistArbs(
                        {
                            license: openLicenseArb,
                            format: jsc.oneof([
                                formatArb(1),
                                formatArb(2),
                                formatArb(3),
                                formatArb(4)
                            ])
                        },
                        {
                            status: jsc.constant("active")
                        },
                        {
                            format: jsc.oneof([
                                formatArb(1),
                                formatArb(2),
                                formatArb(3),
                                formatArb(4)
                            ])
                        }
                    ),
                    record =>
                        record.aspects["dataset-distributions"].distributions
                            .length > 0
                ),
                beforeTest: (record: Record) => {
                    expectStarCount({ record, starCountFn: num => num > 0 });
                }
            });
        });

        describe(`should give 0 stars to datasets with non-open license`, () => {
            ZERO_STAR_LICENSES.forEach(license => {
                it(`${license}`, () => {
                    const record = buildRecordWithDist({ license });

                    expectStarCount({ record, starCount: 0 });

                    return onRecordFound(record, registry);
                });
            });
        });
    });

    describe("formats", () => {
        for (let starCount = 2; starCount <= 4; starCount++) {
            describe(`should set ${starCount} stars`, () => {
                FORMAT_EXAMPLES[starCount].forEach(format => {
                    it(`for ${format}`, () => {
                        const record = buildRecordWithDist({
                            format,
                            license: OKFN_LICENSES[0]
                        });

                        expectStarCount({ record, starCount });

                        return onRecordFound(record, registry);
                    });
                });

                const formatArbForStarCount = formatArb(starCount);
                const sample = jsc.sampler(formatArbForStarCount)(1);
                it(`for fuzzily generated ${starCount} star formats, e.g. "${sample}"`, () => {
                    return runPropertyTest({
                        licenseArb: openLicenseArb,
                        formatArb: formatArbForStarCount,
                        beforeTest: (record: Record) => {
                            expectStarCount({ record, starCount });
                        }
                    });
                });
            });
        }
    });

    it(`if there's an equivalent format in dcat-distribution-strings and dataset format, the star rating should be the same whether the dataset-format aspect is defined or undefined`, () => {
        const recordArb = jsc.suchthat(
            recordArbWithDistArbs(),
            record =>
                record.aspects["dataset-distributions"].distributions.length > 0
        );

        return jsc.assert(
            jsc.forall(recordArb, (record: Record) => {
                const distsWithoutFormatAspect = record.aspects[
                    "dataset-distributions"
                ].distributions.map((dist: any) => {
                    const newDist = { ...dist };
                    newDist.aspects["dataset-format"] = undefined;
                    return newDist;
                });

                const recordWithoutFormatAspect = {
                    ...record,
                    id: record.id + "not"
                };
                recordWithoutFormatAspect.aspects[
                    "dataset-distributions"
                ].distributions = distsWithoutFormatAspect;

                let starCount1: number, starCount2: number;

                expectStarCount({
                    record,
                    starCountFn: num => {
                        starCount1 = num;
                        return true;
                    }
                });
                expectStarCount({
                    record: recordWithoutFormatAspect,
                    starCountFn: num => {
                        starCount2 = num;
                        return true;
                    }
                });

                const bothResults = Promise.all([
                    onRecordFound(record, registry),
                    onRecordFound(recordWithoutFormatAspect, registry)
                ]);

                return bothResults
                    .then(() => {
                        afterEachProperty();

                        return starCount1 === starCount2;
                    })
                    .catch((e: Error) => {
                        afterEachProperty();
                        throw e;
                    });
            })
        );
    });

    it(`If format is in dcat-distribution-strings, dataset-format takes precedence`, () => {
        const starNumberArb = jsc.oneof([1, 2, 3, 4].map(x => jsc.constant(x)));

        const starsArb = jsc.record({
            distStrings: starNumberArb,
            formatAspect: starNumberArb
        });

        const everythingArb = arbFlatMap(
            starsArb,
            starsObj => {
                const thisRecordArb = jsc.suchthat(
                    recordArbWithDistArbs(
                        {
                            license: openLicenseArb,
                            format: formatArb(starsObj.distStrings)
                        },
                        undefined,
                        {
                            format: formatArb(starsObj.formatAspect)
                        }
                    ),
                    record =>
                        record.aspects["dataset-distributions"].distributions
                            .length > 0
                );

                return jsc.record({
                    record: thisRecordArb,
                    numbers: jsc.constant(starsObj)
                });
            },
            x => x.numbers
        );

        return jsc.assert(
            jsc.forall(everythingArb, everything => {
                expectStarCount({
                    record: everything.record,
                    starCount: everything.numbers.formatAspect
                });

                return onRecordFound(everything.record, registry)
                    .then(() => {
                        afterEachProperty();
                        return true;
                    })
                    .catch(e => {
                        afterEachProperty();
                        throw e;
                    });
            })
        );
    });

    describe("should always record the result of the best distribution", () => {
        for (
            let highestStarCount = 0;
            highestStarCount <= 4;
            highestStarCount++
        ) {
            it(`when highest star count is ${highestStarCount}`, () => {
                return jsc.assert(
                    jsc.forall(
                        recordForHighestStarCountArb(highestStarCount),
                        (record: Record) => {
                            beforeEachProperty();

                            expectStarCount({
                                record,
                                starCount: highestStarCount
                            });

                            return onRecordFound(record, registry)
                                .then(() => {
                                    afterEachProperty();
                                    return true;
                                })
                                .catch(e => {
                                    afterEachProperty();
                                    throw e;
                                });
                        }
                    )
                );
            });
        }
    });

    function runPropertyTest({
        licenseArb = openLicenseArb,
        formatArb = stringArb,
        recordArb = jsc.suchthat(
            recordArbWithDistArbs(
                {
                    license: licenseArb,
                    format: formatArb
                },
                undefined,
                {
                    format: formatArb
                }
            ),
            record =>
                record.aspects["dataset-distributions"].distributions.length > 0
        ),
        beforeTest = () => {},
        afterTest = () => {}
    }: {
        licenseArb?: jsc.Arbitrary<string>;
        formatArb?: jsc.Arbitrary<string>;
        recordArb?: jsc.Arbitrary<Record>;
        beforeTest?: (record: Record) => void;
        afterTest?: () => void;
        testCount?: number;
    }) {
        return jsc.assert(
            jsc.forall(recordArb, (record: Record) => {
                beforeEachProperty();

                beforeTest(record);

                return onRecordFound(record, registry)
                    .then(() => {
                        afterEachProperty();
                        afterTest();
                        return true;
                    })
                    .catch(e => {
                        afterEachProperty();
                        throw e;
                    });
            })
        );
    }

    type StarCountArgs = {
        record: Record;
        starCount?: number;
        starCountFn?: ((num: number) => boolean);
    };

    function expectStarCount({
        record,
        starCount,
        starCountFn = x => x === starCount
    }: StarCountArgs) {
        if (!starCount && !starCountFn) {
            throw new Error("Must provide starCount or starCountFn");
        }

        registryScope
            .put(
                `/records/${encodeURIComponentWithApost(
                    record.id
                )}/aspects/dataset-linked-data-rating`,
                (obj: any) => starCountFn(obj.stars)
            )
            .reply(201);

        registryScope
            .put(
                `/records/${encodeURIComponentWithApost(
                    record.id
                )}/aspects/dataset-quality-rating`,
                (obj: any) =>
                    starCountFn(obj["dataset-linked-data-rating"].score * 5)
            )
            .reply(201);
    }

    function buildRecordWithDist(dist?: any): Record {
        return {
            id: "1",
            name: "name",
            aspects: {
                "dataset-distributions": {
                    distributions: _.isUndefined(dist)
                        ? []
                        : [
                              {
                                  aspects: {
                                      "dcat-distribution-strings": dist
                                  }
                              }
                          ]
                }
            },
            sourceTag: undefined
        };
    }
});

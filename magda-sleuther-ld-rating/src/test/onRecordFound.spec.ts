import onRecordFound from "../onRecordFound";
import {} from "mocha";
import * as sinon from "sinon";
import { expect } from "chai";
import * as nock from "nock";
///<reference path="@magda/typescript-common/dist/test/jsverify.d.ts" />
import jsc = require("jsverify");
import { Record } from "@magda/typescript-common/dist/generated/registry/api";
import * as _ from "lodash";
import {
  recordArbWithDistArbs,
  stringArb
} from "@magda/typescript-common/dist/test/arbitraries";
import {
  openLicenseArb,
  formatArb,
  recordForHighestStarCountArb
} from "./arbitraries";
import { encodeURIComponentWithApost } from "@magda/typescript-common/dist/test/util";
import { OKFN_LICENSES, ZERO_STAR_LICENSES, FORMAT_EXAMPLES } from "./examples";

describe("ld rating onRecordFound", function(
  this: Mocha.ISuiteCallbackContext
) {
  this.timeout(10000);
  nock.disableNetConnect();
  const registryUrl = "http://example.com";
  process.env.REGISTRY_URL = registryUrl;
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
    registryScope.patch(/.*/).reply(201);
    expectStarCount(record, 0);

    return onRecordFound(record, 0);
  });

  describe("licenses", () => {
    describe("endorsed by OKFN should get 1 star:", () => {
      OKFN_LICENSES.forEach((license: string) => {
        it(license, () => {
          const record = buildRecordWithDist({ license });
          registryScope.patch(/.*/).reply(201);
          expectStarCount(record, 1);

          return onRecordFound(record, 0);
        });
      });
    });

    it("should give fuzzily generated open licenses a star", () => {
      return runPropertyTest({
        licenseArb: openLicenseArb(jsc),
        formatArb: jsc.constant(undefined),
        beforeTest: (record: Record) => {
          registryScope.patch(/.*/).reply(201);
          expectStarCount(record, 1);
        }
      });
    });

    describe(`should give 0 stars to datasets with non-open license`, () => {
      ZERO_STAR_LICENSES.forEach(license => {
        it(`${license}`, () => {
          const record = buildRecordWithDist({ license });
          registryScope.patch(/.*/).reply(201);
          expectStarCount(record, 0);

          return onRecordFound(record, 0);
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
            registryScope.patch(/.*/).reply(201);
            expectStarCount(record, starCount);

            return onRecordFound(record, 0);
          });
        });

        const formatArbForStarCount = formatArb(jsc, starCount);
        const sample = jsc.sampler(formatArbForStarCount)(1);
        it(`for fuzzily generated ${starCount} star formats, e.g. "${sample}"`, () => {
          return runPropertyTest({
            licenseArb: openLicenseArb(jsc),
            formatArb: formatArbForStarCount,
            beforeTest: (record: Record) => {
              registryScope.patch(/.*/).reply(201);
              expectStarCount(record, starCount);
            }
          });
        });
      });
    }
  });

  describe("quality rating", () => {
    it("should match the star rating", () => {
      let putBody: any;
      let patchBody: any;

      return runPropertyTest({
        licenseArb: jsc.oneof([openLicenseArb(jsc), stringArb(jsc)]),
        formatArb: jsc.oneof([
          stringArb(jsc),
          formatArb(jsc, 2),
          formatArb(jsc, 3),
          formatArb(jsc, 4)
        ]),
        beforeTest: (record: Record) => {
          registryScope
            .patch(/.*/, (body: any) => {
              patchBody = body;
              return true;
            })
            .reply(201);
          registryScope
            .put(/.*/, (body: any) => {
              putBody = body;
              return true;
            })
            .reply(201);
        },
        afterTest: () => {
          const quality = patchBody[0].value;
          expect(quality.score * 5).to.equal(putBody.stars);
          expect(quality.weighting).to.be.gt(0);
          expect(quality.weighting).to.be.lt(1);
        }
      });
    });
  });

  describe("should always record the result of the best distribution", () => {
    for (let highestStarCount = 0; highestStarCount <= 4; highestStarCount++) {
      it(`when highest star count is ${highestStarCount}`, () => {
        return jsc.assert(
          jsc.forall(
            recordForHighestStarCountArb(jsc, highestStarCount),
            (record: Record) => {
              beforeEachProperty();

              registryScope.patch(/.*/).reply(201);
              expectStarCount(record, highestStarCount);

              return onRecordFound(record, 0)
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
    licenseArb = openLicenseArb(jsc),
    formatArb = stringArb(jsc),
    recordArb = jsc.suchthat(
      recordArbWithDistArbs(jsc, {
        license: licenseArb,
        format: formatArb
      }),
      record => record.aspects["dataset-distributions"].distributions.length > 0
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

        return onRecordFound(record, 0)
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

  function expectStarCount(record: Record, starCount: number) {
    registryScope
      .put(
        `/records/${encodeURIComponentWithApost(
          record.id
        )}/aspects/dataset-linked-data-rating`,
        {
          stars: starCount
        }
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
      }
    };
  }
});

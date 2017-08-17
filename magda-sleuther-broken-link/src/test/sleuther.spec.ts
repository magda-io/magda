import {} from "mocha";
import { expect } from "chai";
import * as sinon from "sinon";
import * as nock from "nock";
///<reference path="@magda/typescript-common/src/test/jsverify.d.ts" />
import jsc = require("jsverify");
import Registry from "@magda/typescript-common/dist/Registry";
import { Record } from "@magda/typescript-common/dist/generated/registry/api";
import * as _ from "lodash";
import { onRecordFound, BrokenLinkAspect } from "../sleuther";
import {
  specificRecordArb,
  distStringsArb,
  distUrlArb,
  arrayOfSizeArb,
  arbFlatMap
} from "@magda/typescript-common/src/test/arbitraries";
import { encodeURIComponentWithApost } from "@magda/typescript-common/src/test/util";
import * as URI from "urijs";
const setupFtp = require("./setup-ftp");
const dns = require("dns");

const KNOWN_PROTOCOLS = ["https", "http", "ftp"];

describe("onRecordFound", function(this: Mocha.ISuiteCallbackContext) {
  this.timeout(60000);
  nock.disableNetConnect();
  const registryUrl = "http://example.com";
  let registryScope: nock.Scope;
  let ftp: any;

  before(() => {
    const originalDns = dns.lookup;

    // Set up an FTP server that will respond in line with test data.
    ftp = setupFtp();

    // Mess with node DNS so that a call to any host that starts with FTP actually gets resolved to our local FTP server.
    sinon.stub(dns, "lookup").callsFake((hostname, options, callback) => {
      if (hostname.startsWith("ftp")) {
        callback(null, "127.0.0.1", 4);
      } else {
        originalDns(hostname, options, callback);
      }
    });

    sinon.stub(console, "info");

    nock.emitter.on("no match", onMatchFail);
  });

  const onMatchFail = (req: any) => {
    console.error("Match failure: " + JSON.stringify(req.path));
  };

  after(() => {
    dns.lookup.restore();
    (console.info as any).restore();

    ftp.close();
    nock.emitter.removeListener("no match", onMatchFail);
  });

  const beforeEachProperty = () => {
    registryScope = nock(registryUrl); //.log(console.log);
  };

  const afterEachProperty = () => {
    nock.cleanAll();
  };

  /**
   * Generates records with distributions.
   */
  const recordArb = (distUrlArb?: jsc.Arbitrary<String>) =>
    specificRecordArb(jsc)({
      "dataset-distributions": jsc.record({
        distributions: jsc.suchthat(
          jsc.array(
            specificRecordArb(jsc)({
              "dcat-distribution-strings": distStringsArb(jsc, distUrlArb)
            })
          ),
          (arr: Record[]) => {
            const ids = arr.map(_ => _.id);

            return _.isEqual(ids, _.uniq(ids));
          }
        )
      })
    });

  const defaultRecordArb = recordArb();

  /**
   * Gets an array of the individual urls from every distribution inside a dataset record, including both downloadURL and accessURL.
   */
  function urlsFromDataSet(record: Record): string[] {
    return _(record.aspects["dataset-distributions"].distributions)
      .map((dist: any) => dist.aspects["dcat-distribution-strings"])
      .flatMap(_.values)
      .filter(x => !!x)
      .value();
  }

  /**
   * Generates a record along with a map of every distribution URL to whether 
   * or not it should successfully return.
   */
  const recordArbWithSuccesses: jsc.Arbitrary<{
    record: Record;
    successes: object;
  }> = arbFlatMap(
    jsc,
    defaultRecordArb,
    (record: Record) => {
      const urls: any[] = _(urlsFromDataSet(record))
        .filter(url => KNOWN_PROTOCOLS.indexOf(URI(url).scheme()) >= 0)
        .uniq()
        .value();

      const gens: jsc.Arbitrary<boolean>[] = urls.map(() => jsc.bool);

      const gen = gens.length > 0 ? jsc.tuple(gens) : jsc.constant([]);

      return gen.smap(
        successfulArr => {
          const successes = urls.reduce((soFar, current, index) => {
            soFar[current] = successfulArr[index];
            return soFar;
          }, {});

          return { record, successes };
        },
        ({ record, successes }) =>
          urlsFromDataSet(record).map(url => successes[url])
      );
    },
    ({ record, successes }) => record
  );

  /**
   * recordArbWithSuccesses, but ensures that no ftp:// paths are duplicated, 
   * as that confuses our fake FTP server which only has a map of paths and 
   * whether or not to return a successful match for each.
   */
  const recordArbWithSuccessesNoDupFtpPaths = jsc.suchthat(
    recordArbWithSuccesses,
    ({ record, successes }) => {
      const ftpPaths = _(urlsFromDataSet(record))
        .filter((x: string) => x.startsWith("ftp"))
        .map(url => new URI(url).path())
        .value();

      return _.isEqual(_.uniq(ftpPaths), ftpPaths);
    }
  );

  /**
   * Generator-driven super-test: generates records and runs them through the
   * onRecordFound function, listening for HTTP and FTP calls made and returning
   * success or failure based on generated outcomes, then checks that they're
   * recorded on a by-distribution basis as link status as well as on a by-record
   * basis as a part of dataset quality.
   */
  it("Should correctly record link statuses and quality", function() {
    return jsc.assert(
      jsc.forall(
        recordArbWithSuccessesNoDupFtpPaths,
        ({
          record,
          successes
        }: {
          record: Record;
          successes: { [x: string]: boolean };
        }) => {
          beforeEachProperty();

          // Tell the FTP server to return success/failure for the various FTP
          // paths with this dodgy method. Note that because the FTP server can
          // only see paths and not host, we only send it the path of the req.
          ftp.successes = _(successes)
            .pickBy((value, url) => url.startsWith("ftp"))
            .mapKeys((value: boolean, url: string) => new URI(url).path())
            .value();

          const allDists =
            record.aspects["dataset-distributions"].distributions;

          const httpDistUrls = _(urlsFromDataSet(record))
            .filter((x: string) => x.startsWith("http"))
            .map((url: string) => ({
              url,
              success: successes[url]
            }))
            .value();

          // Set up a nock scope for every HTTP URL - the sleuther will actually
          // attempt to download these but it'll be intercepted by nock.
          const distScopes = httpDistUrls.map(
            ({ url, success }: { url: string; success: boolean }) =>
              nock(url)
                .head(url.endsWith("/") ? "/" : "")
                .reply(success ? 200 : 404)
          );

          const results = allDists.map((dist: Record) => {
            const { downloadURL, accessURL } = dist.aspects[
              "dcat-distribution-strings"
            ];
            const success = successes[downloadURL] || successes[accessURL];

            const isUnknownProtocol = (url: string) => {
              if (!url) {
                return false;
              }
              const scheme = URI(url).scheme();
              return !scheme || KNOWN_PROTOCOLS.indexOf(scheme) === -1;
            };

            const downloadUnknown = isUnknownProtocol(downloadURL);
            const accessUnknown = isUnknownProtocol(accessURL);

            const result = success
              ? "active"
              : downloadUnknown || accessUnknown ? "unknown" : "broken";

            registryScope
              .put(
                `/records/${encodeURIComponentWithApost(
                  dist.id
                )}/aspects/source-link-status`,
                (body: BrokenLinkAspect) => {
                  const doesStatusMatch = body.status === result;

                  const isHttpSuccess =
                    (successes[downloadURL] &&
                      downloadURL.startsWith("http")) ||
                    (!successes[downloadURL] &&
                      successes[accessURL] &&
                      accessURL.startsWith("http"));

                  const isHttpFailure =
                    result === "broken" &&
                    ((downloadURL && downloadURL.startsWith("http")) ||
                      (!downloadURL &&
                        accessURL &&
                        accessURL.startsWith("http")));

                  const doesResponseCodeMatch = ((code?: number) => {
                    if (isHttpSuccess) {
                      return code === 200;
                    } else if (isHttpFailure) {
                      return code === 404;
                    } else {
                      return _.isUndefined(code);
                    }
                  })(body.httpStatusCode);

                  const doesErrorMatch = ((arg?: Error) =>
                    success ? _.isUndefined(arg) : !_.isUndefined(arg))(
                    body.errorDetails
                  );

                  return (
                    doesStatusMatch && doesResponseCodeMatch && doesErrorMatch
                  );
                }
              )
              .reply(201);

            return result;
          });

          if (allDists.length > 0) {
            const expectedQualityScore =
              results.filter((result: string) => result === "active").length /
              allDists.length;

            registryScope
              .patch(
                `/records/${encodeURIComponentWithApost(
                  record.id
                )}/aspects/dataset-quality-rating`,
                [
                  {
                    op: "add",
                    path: "/source-link-status",
                    value: {
                      score: expectedQualityScore,
                      weighting: 1
                    }
                  }
                ]
              )
              .reply(201);
          }

          const registry = new Registry({
            baseUrl: registryUrl,
            maxRetries: 0
          });

          return onRecordFound(registry, record, 0, 0)
            .then(() => {
              distScopes.forEach(scope => scope.done());
              registryScope.done();
            })
            .then(() => {
              afterEachProperty();
              return true;
            })
            .catch(e => {
              afterEachProperty();
              throw e;
            });
        }
      ),
      {
        // rngState: "092b7e0365c8da4f19",
        tests: 500
      }
    );
  });

  /**
   * Record arbitrary that only generates datasets with HTTP or HTTPS urls, with
   * at least one distribution per dataset and with at least one valid url per
   * distribution, for testing retries.
   */
  const httpOnlyRecordArb = jsc.suchthat(
    recordArb(
      jsc.oneof([
        jsc.constant(undefined),
        distUrlArb(jsc, {
          schemeArb: jsc.oneof([jsc.constant("http"), jsc.constant("https")])
        })
      ])
    ),
    record =>
      record.aspects["dataset-distributions"].distributions.length > 1 &&
      record.aspects[
        "dataset-distributions"
      ].distributions.every((dist: any) => {
        const aspect = dist.aspects["dcat-distribution-strings"];

        const definedURLs = [aspect.accessURL, aspect.downloadURL].filter(
          x => !!x
        );

        return (
          definedURLs.length > 0 && definedURLs.every(x => x.startsWith("http"))
        );
      })
  );

  /** 
   * Generates a failing HTTP code at random, excepting 429 because that
   * triggers different behaviour.
   */
  const failureCodeArb = jsc.suchthat(
    jsc.integer(300, 600),
    int => int !== 429
  );

  describe("retrying", () => {
    /**
     * Runs onRecordFound with a number of failing codes, testing whether the
     * sleuther retries the correct number of times, and whether it correctly
     * records a success after retries or a failure after the retries run out.
     * 
     * This tests both 429 retries and other retries - this involves different
     * behaviour as the retry for 429 (which indicates rate limiting) require
     * a much longer cool-off time and hence are done differently.
     * 
     * @param caption The caption to use for the mocha "it" call.
     * @param result Whether to test for a number of retries then a success, a
     *                number of retries then a failure because of too many 429s,
     *                or a number of retries then a failure because of too many
     *                non-429 failures (e.g. 404s)
     */
    const retrySpec = (
      caption: string,
      result: "success" | "fail429" | "failNormal"
    ) => {
      it(caption, function() {
        const retryCountArb = jsc.integer(0, 5);

        type FailuresArbResult = {
          retryCount: number;
          allResults: number[][];
        };

        /**
         * Generates a retryCount and a nested array of results to return to the
         * sleuther - the inner arrays are status codes to be returned (in order),
         * after each inner array is finished a 429 will be returned, then the 
         * next array of error codes will be returned.
         */
        const failuresArb: jsc.Arbitrary<FailuresArbResult> = arbFlatMap<
          number,
          FailuresArbResult
        >(
          jsc,
          retryCountArb,
          (retryCount: number) => {
            /** Generates how many 429 codes will be returned */
            const count429Arb =
              result === "fail429"
                ? jsc.constant(retryCount)
                : jsc.integer(0, retryCount);

            /** Generates how long the array of non-429 failures should be. */
            const failureCodeLengthArb = jsc.integer(0, retryCount);

            const allResultsArb = arbFlatMap<number, number[]>(
              jsc,
              count429Arb,
              count429s =>
                arrayOfSizeArb(jsc, count429s + 1, failureCodeLengthArb),
              (failureCodeArr: number[]) => failureCodeArr.length
            ).flatMap<number[][]>(
              (failureCodeArrSizes: number[]) => {
                const failureCodeArbs = failureCodeArrSizes.map(size =>
                  arrayOfSizeArb(jsc, size, failureCodeArb)
                );

                if (result === "failNormal") {
                  failureCodeArbs[failureCodeArbs.length - 1] = arrayOfSizeArb(
                    jsc,
                    retryCount + 1,
                    failureCodeArb
                  );
                }

                return failureCodeArrSizes.length > 0
                  ? jsc.tuple(failureCodeArbs)
                  : jsc.constant([]);
              },
              failures => failures.map(inner => inner.length)
            );

            const combined = jsc.record<FailuresArbResult>({
              retryCount: jsc.constant(retryCount),
              allResults: allResultsArb
            });

            return combined;
          },
          ({ retryCount }: FailuresArbResult) => {
            return retryCount;
          }
        );

        return jsc.assert(
          jsc.forall(
            httpOnlyRecordArb,
            failuresArb,
            (record: Record, { retryCount, allResults }: FailuresArbResult) => {
              beforeEachProperty();
              const registry = new Registry({
                baseUrl: registryUrl,
                maxRetries: 0
              });

              const distScopes = urlsFromDataSet(record).map(url => {
                const scope = nock(url); //.log(console.log);

                allResults.forEach((failureCodes, i) => {
                  failureCodes.forEach(failureCode => {
                    scope.head(url.endsWith("/") ? "/" : "").reply(failureCode);
                  });
                  if (i < allResults.length - 1 || result === "fail429") {
                    scope.head(url.endsWith("/") ? "/" : "").reply(429);
                  }
                });

                if (result === "success") {
                  scope.head(url.endsWith("/") ? "/" : "").reply(200);
                }

                return scope;
              });

              const allDists =
                record.aspects["dataset-distributions"].distributions;

              allDists.forEach((dist: Record) => {
                registryScope
                  .put(
                    `/records/${encodeURIComponentWithApost(
                      dist.id
                    )}/aspects/source-link-status`,
                    (response: any) => {
                      const statusMatch =
                        response.status ===
                        {
                          success: "active",
                          failNormal: "broken",
                          fail429: "unknown"
                        }[result];
                      const codeMatch =
                        !_.isUndefined(response.httpStatusCode) &&
                        response.httpStatusCode ===
                          {
                            success: 200,
                            failNormal: _.last(_.last(allResults)),
                            fail429: 429
                          }[result];

                      return statusMatch && codeMatch;
                    }
                  )
                  .reply(201);
              });

              if (allDists.length > 0) {
                registryScope
                  .patch(
                    `/records/${encodeURIComponentWithApost(
                      record.id
                    )}/aspects/dataset-quality-rating`,
                    [
                      {
                        op: "add",
                        path: "/source-link-status",
                        value: {
                          score: result === "success" ? 1 : 0,
                          weighting: 1
                        }
                      }
                    ]
                  )
                  .reply(201);
              }

              return onRecordFound(registry, record, 0, retryCount)
                .then(() => {
                  registryScope.done();
                  distScopes.forEach(scope => scope.done());
                })
                .then(() => {
                  afterEachProperty();
                  return true;
                })
                .catch(e => {
                  afterEachProperty();
                  throw e;
                });
            }
          ),
          {
            // rngState: "828caf026d4be91573"
            tests: 50
          }
        );
      });
    };

    retrySpec(
      "Should result in success if the last retry is successful",
      "success"
    );
    retrySpec(
      "Should result in failures if the max number of retries is exceeded",
      "failNormal"
    );
    retrySpec(
      "Should result in failures if the max number of 429s is exceeded",
      "fail429"
    );
  });

  it("Should only try to make one request per host at a time", function() {
    const httpOrHttps = jsc.sampler(
      jsc.oneof([jsc.constant("http"), jsc.constant("https")])
    )(1);

    const urlArb = distUrlArb(jsc, {
      schemeArb: jsc.constant(httpOrHttps),
      hostArb: jsc.oneof([
        jsc.constant("example1"),
        jsc.constant("example2"),
        jsc.constant("example3")
      ])
    });

    const thisRecordArb = jsc.suchthat(recordArb(urlArb), record => {
      const urls: string[] = urlsFromDataSet(record);
      const hosts: string[] = urls.map(url => {
        const uri = new URI(url);

        return uri.scheme() + "://" + uri.host();
      });

      return !_.isEqual(_.uniq(hosts), hosts);
    });

    return jsc.assert(
      jsc.forall(
        thisRecordArb,
        jsc.nearray(failureCodeArb),
        jsc.integer(0, 25),
        (record: Record, failures: number[], delayMs: number) => {
          beforeEachProperty();

          const registry = new Registry({
            baseUrl: registryUrl,
            maxRetries: 0
          });

          const distScopes = urlsFromDataSet(
            record
          ).reduce((scopeLookup, url) => {
            const uri = new URI(url);
            const base = uri.scheme() + "://" + uri.host();

            if (!scopeLookup[base]) {
              scopeLookup[base] = nock(base);
            }

            const scope = scopeLookup[base];

            failures.forEach(failureCode =>
              scope.head(uri.path()).delay(delayMs).reply(failureCode)
            );

            scope.head(uri.path()).delay(delayMs).reply(200);
            return scopeLookup;
          }, {} as { [host: string]: nock.Scope });

          _.forEach(distScopes, (scope: nock.Scope, host: string) => {
            let countForThisScope = 0;

            scope.on("request", () => {
              countForThisScope++;
              expect(countForThisScope).to.equal(1);
            });

            scope.on("replied", () => {
              countForThisScope--;
              expect(countForThisScope).to.equal(0);
            });
          });

          const allDists =
            record.aspects["dataset-distributions"].distributions;

          registryScope.patch(/.*/).reply(201);
          registryScope.put(/.*/).times(allDists.length).reply(201);

          return onRecordFound(registry, record, 0, failures.length)
            .then(() => {
              _.values(distScopes).forEach(scope => scope.done());
            })
            .then(() => {
              afterEachProperty();
              return true;
            })
            .catch(e => {
              afterEachProperty();
              throw e;
            });
        }
      ),
      {
        tests: 10
      }
    );
  });

  const emptyRecordArb = jsc.oneof([
    specificRecordArb(jsc)({
      "dataset-distributions": jsc.constant(undefined)
    }),
    specificRecordArb(jsc)({
      "dataset-distributions": jsc.record({
        distributions: jsc.constant([])
      })
    })
  ]);

  jsc.property(
    "Should do nothing if no distributions",
    emptyRecordArb,
    record => {
      beforeEachProperty();

      const registry = new Registry({
        baseUrl: registryUrl
      });

      return onRecordFound(registry, record).then(() => {
        afterEachProperty();

        registryScope.done();
        return true;
      });
    }
  );
});

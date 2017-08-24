import {} from "mocha";
import { expect } from "chai";
import * as sinon from "sinon";
import * as nock from "nock";
///<reference path="@magda/typescript-common/dist/test/jsverify.d.ts" />
import jsc = require("jsverify");
import { Record } from "@magda/typescript-common/dist/generated/registry/api";
import * as _ from "lodash";
import onRecordFound from "../onRecordFound";
import { BrokenLinkAspect } from "../brokenLinkAspectDef";
import {
  specificRecordArb,
  distUrlArb,
  arrayOfSizeArb,
  arbFlatMap,
  recordArbWithDistArbs
} from "@magda/typescript-common/dist/test/arbitraries";
import { encodeURIComponentWithApost } from "@magda/typescript-common/dist/test/util";
import * as URI from "urijs";
import * as Client from "ftp";
import FtpHandler from "../FtpHandler";

const KNOWN_PROTOCOLS = ["https", "http", "ftp"];

describe("onRecordFound", function(this: Mocha.ISuiteCallbackContext) {
  this.timeout(20000);
  nock.disableNetConnect();
  const registryUrl = "http://example.com";
  process.env.REGISTRY_URL = registryUrl;
  let registryScope: nock.Scope;
  let clients: { [s: string]: Client[] };
  let ftpSuccesses: { [url: string]: CheckResult };

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
    clients = {};
    ftpSuccesses = {};
  };

  const afterEachProperty = () => {
    nock.cleanAll();
  };

  /**
   * Builds FTP clients that have all their important methods stubbed out - these
   * will respond based on the current content of ftpSuccesses.
   */
  const clientFactory = () => {
    const client = new Client();
    let readyCallback: () => void;
    let key: string;
    sinon
      .stub(client, "connect")
      .callsFake(({ host, port }: { host: string; port: number }) => {
        const keyPort = port !== 21 ? `:${port}` : "";
        key = `${host}${keyPort}`;
        if (!clients[key]) {
          clients[key] = [];
        }
        clients[key].push(client);
        readyCallback();
      });
    sinon
      .stub(client, "on")
      .callsFake((event: string, callback: () => void) => {
        if (event === "ready") {
          readyCallback = callback;
        }
      });
    sinon
      .stub(client, "list")
      .callsFake(
        (path: string, callback: (err: Error, list: string[]) => void) => {
          try {
            expect(key).not.to.be.undefined;
            const url = `ftp://${key}${path}`;

            const success = ftpSuccesses[url];
            expect(success).not.to.be.undefined;

            if (success === "success") {
              callback(null, ["file"]);
            } else if (success === "notfound") {
              callback(null, []);
            } else {
              callback(new Error("Fake error!"), null);
            }
          } catch (e) {
            console.error(e);
            callback(e, null);
          }
        }
      );
    return client;
  };

  const fakeFtpHandler = new FtpHandler(clientFactory);

  const defaultRecordArb = recordArbWithDistArbs(jsc, { url: distUrlArb(jsc) });

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

  type CheckResult = "success" | "error" | "notfound";
  const checkResultArb: jsc.Arbitrary<CheckResult> = jsc.oneof(
    ["success" as "success", "error" as "error", "notfound" as "notfound"].map(
      jsc.constant
    )
  );

  /**
   * Generates a record along with a map of every distribution URL to whether
   * or not it should successfully return.
   */
  const recordArbWithSuccesses: jsc.Arbitrary<{
    record: Record;
    successes: {
      [a: string]: CheckResult;
    };
  }> = arbFlatMap(
    jsc,
    defaultRecordArb,
    (record: Record) => {
      const getKnownProtocolUrls = (record: Record) =>
        _(urlsFromDataSet(record))
          .filter(url => KNOWN_PROTOCOLS.indexOf(URI(url).scheme()) >= 0)
          .uniq()
          .value();

      const urls = getKnownProtocolUrls(record);

      const gen: jsc.Arbitrary<CheckResult[]> = arrayOfSizeArb(
        jsc,
        urls.length,
        checkResultArb
      );

      return gen.smap(
        successfulArr => {
          const successes = urls.reduce((soFar, current, index) => {
            soFar[current] = successfulArr[index];
            return soFar;
          }, {} as { [a: string]: CheckResult });

          return { record, successes };
        },
        ({ record, successes }) => {
          return getKnownProtocolUrls(record).map(url => successes[url]);
        }
      );
    },
    ({ record, successes }) => record
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
      jsc.forall(recordArbWithSuccesses, ({ record, successes }) => {
        beforeEachProperty();
        // console.log({ record, successes });

        // Tell the FTP server to return success/failure for the various FTP
        // paths with this dodgy method. Note that because the FTP server can
        // only see paths and not host, we only send it the path of the req.
        ftpSuccesses = _.pickBy(successes, (value, url) =>
          url.startsWith("ftp")
        );

        const allDists = record.aspects["dataset-distributions"].distributions;

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
          ({ url, success }: { url: string; success: CheckResult }) => {
            const scope = nock(url).head(url.endsWith("/") ? "/" : "");

            if (success !== "error") {
              return scope.reply(success === "success" ? 200 : 404);
            } else {
              return scope.replyWithError("fail");
            }
          }
        );

        const results = allDists.map((dist: Record) => {
          const { downloadURL, accessURL } = dist.aspects[
            "dcat-distribution-strings"
          ];
          const success =
            successes[downloadURL] === "success"
              ? "success"
              : successes[accessURL];

          const isUnknownProtocol = (url: string) => {
            if (!url) {
              return false;
            }
            const scheme = URI(url).scheme();
            return !scheme || KNOWN_PROTOCOLS.indexOf(scheme) === -1;
          };

          const downloadUnknown = isUnknownProtocol(downloadURL);
          const accessUnknown = isUnknownProtocol(accessURL);

          const result =
            success === "success"
              ? "active"
              : downloadUnknown || accessUnknown ? "unknown" : "broken";

          registryScope
            .put(
              `/records/${encodeURIComponentWithApost(
                dist.id
              )}/aspects/source-link-status`,
              (body: BrokenLinkAspect) => {
                const doesStatusMatch = body.status === result;

                const isDownloadUrlHttp =
                  downloadURL && downloadURL.startsWith("http");
                const isAccessUrlHttp =
                  accessURL && accessURL.startsWith("http");

                const isDownloadUrlHttpSuccess =
                  isDownloadUrlHttp && successes[downloadURL] === "success";

                const isDownloadUrlFtpSuccess =
                  !isDownloadUrlHttp && successes[downloadURL] === "success";

                const isAccessURLHttpSuccess =
                  isAccessUrlHttp && successes[accessURL] === "success";

                const isHttpSuccess: boolean =
                  isDownloadUrlHttpSuccess ||
                  (!isDownloadUrlFtpSuccess && isAccessURLHttpSuccess);

                const is404: boolean =
                  result === "broken" &&
                  ((isDownloadUrlHttp &&
                    successes[downloadURL] === "notfound") ||
                    (_.isUndefined(downloadURL) &&
                      isAccessUrlHttp &&
                      successes[accessURL] === "notfound"));

                const doesResponseCodeMatch = ((code?: number) => {
                  if (isHttpSuccess) {
                    return code === 200;
                  } else if (is404) {
                    return code === 404;
                  } else {
                    return _.isUndefined(code);
                  }
                })(body.httpStatusCode);

                const doesErrorMatch = ((arg?: Error) =>
                  success === "success"
                    ? _.isUndefined(arg)
                    : !_.isUndefined(arg))(body.errorDetails);

                // console.log(
                //   `${dist.id}: ${doesStatusMatch} && ${doesResponseCodeMatch} && ${doesErrorMatch} `
                // );

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

        return onRecordFound(record, 0, 0, 0, fakeFtpHandler)
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
      }),
      {
        // rngState: "0a60f4c38b75a2d1e9",
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
    recordArbWithDistArbs(
      jsc,
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

              return onRecordFound(record, 0, retryCount)
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

    const thisRecordArb = jsc.suchthat(
      recordArbWithDistArbs(jsc, { url: urlArb }),
      record => {
        const urls: string[] = urlsFromDataSet(record);
        const hosts: string[] = urls.map(url => {
          const uri = new URI(url);

          return uri.scheme() + "://" + uri.host();
        });

        return !_.isEqual(_.uniq(hosts), hosts);
      }
    );

    return jsc.assert(
      jsc.forall(
        thisRecordArb,
        jsc.nearray(failureCodeArb),
        jsc.integer(0, 25),
        (record: Record, failures: number[], delayMs: number) => {
          beforeEachProperty();

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

          return onRecordFound(record, 0, failures.length)
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

      return onRecordFound(record).then(() => {
        afterEachProperty();

        registryScope.done();
        return true;
      });
    }
  );
});

import {} from "mocha";
// import { expect } from "chai";
import * as sinon from "sinon";
import * as nock from "nock";
///<reference path="@magda/typescript-common/spec/jsverify.d.ts" />
import jsc = require("jsverify");
import Registry from "@magda/typescript-common/dist/Registry";
import { Record } from "@magda/typescript-common/dist/generated/registry/api";
import * as _ from "lodash";
import { onRecordFound } from "../src/sleuther";
import {
  specificRecordArb,
  distStringsArb
} from "@magda/typescript-common/spec/arbitraries";
import { encodeURIComponentWithApost } from "@magda/typescript-common/spec/util";
import * as URI from "urijs";
const setupFtp = require("./setup-ftp");
const dns = require("dns");

const KNOWN_PROTOCOLS = ["https", "http", "ftp"];

describe("onRecordFound", function(this: Mocha.ISuiteCallbackContext) {
  this.timeout(60000);
  nock.disableNetConnect();
  const registryUrl = "http://blah.com";
  let registryScope: nock.Scope;
  let ftp: any;

  before(() => {
    const originalDns = dns.lookup;

    sinon.stub(dns, "lookup").callsFake((hostname, options, callback) => {
      if (hostname.startsWith("ftp")) {
        callback(null, "127.0.0.1", 4);
      } else {
        originalDns(hostname, options, callback);
      }
    });

    sinon.stub(console, "info");

    ftp = setupFtp();
  });

  after(() => {
    dns.lookup.restore();
    (console.info as any).restore();

    ftp.close();
  });

  const recordArb = specificRecordArb(jsc)({
    "dataset-distributions": jsc.record({
      distributions: jsc.array(
        specificRecordArb(jsc)({
          "dcat-distribution-strings": distStringsArb(jsc)
        })
      )
    })
  });

  function urlsFromRecord(record: Record): string[] {
    return _(record.aspects["dataset-distributions"].distributions)
      .map((dist: any) => dist.aspects["dcat-distribution-strings"])
      .flatMap(_.values)
      .filter(x => !!x)
      .value();
  }

  const recordArbWithSuccesses: jsc.Arbitrary<{
    record: Record;
    successes: object;
  }> = jsc.bless({
    generator: recordArb.generator.flatmap(record => {
      const urls: any[] = _(urlsFromRecord(record))
        .filter(url => KNOWN_PROTOCOLS.indexOf(URI(url).scheme()) >= 0)
        .uniq()
        .value();

      const gens: jsc.Generator<boolean>[] = urls.map(() => jsc.bool.generator);

      const gen = jsc.generator.tuple(gens);

      return gen.map(successfulArr => {
        const successes = urls.reduce((soFar, current, index) => {
          soFar[current] = successfulArr[index];
          return soFar;
        }, {});

        return { record, successes };
      });
    }),

    show: ({ record, successes }: { record: Record; successes: object }) =>
      recordArb.show(record) + " and " + JSON.stringify(successes),
    shrink: jsc.shrink.bless(
      ({ record, successes }: { record: Record; successes: object }) => {
        const records = recordArb.shrink(record);

        return records.map(record => {
          const urls = _.uniq(urlsFromRecord(record));

          const after = {
            record,
            successes: _.pickBy(
              successes,
              (value: boolean, key: string) => urls.indexOf(key) >= 0
            )
          };

          return after;
        });
      }
    )
  });

  const recordArbWithSuccessesNoDupFtpPaths = jsc.suchthat(
    recordArbWithSuccesses,
    (result: any) => {
      const ftpPaths = _(
        result.record.aspects["dataset-distributions"].distributions
      )
        .map((dist: any) => dist.aspects["dcat-distribution-strings"])
        .flatMap(_.values)
        .filter(x => !!x)
        .filter((x: string) => x.startsWith("ftp"))
        .map(url => new URI(url).path())
        .value();

      // console.log(
      //   "FTP Paths: " +
      //     _.uniq(ftpPaths) +
      //     "|" +
      //     ftpPaths +
      //     "... " +
      //     _.isEqual(_.uniq(ftpPaths), ftpPaths)
      // );

      return _.isEqual(_.uniq(ftpPaths), ftpPaths);
    }
  );

  const beforeEachProperty = () => {
    // sinon.stub(console, "log");
    registryScope = nock(registryUrl)//.log(console.log);
  };

  const afterEachProperty = () => {
    // (console.log as any).restore();
    nock.cleanAll();
  };

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

          ftp.successes = _(successes)
            .pickBy((value, url) => url.startsWith("ftp"))
            .mapKeys((value: boolean, url: string) => new URI(url).path())
            .value();

          const allDists =
            record.aspects["dataset-distributions"].distributions;

          const allDistStrings = _(allDists)
            .map((dist: any) => dist.aspects["dcat-distribution-strings"])
            .value();

          const httpDistUrls = _(allDistStrings)
            .flatMap(_.values)
            .filter(x => !!x)
            .filter((x: string) => !x.startsWith("ftp"))
            .map((url: string) => ({
              url,
              success: successes[url]
            }))
            .value();

          const distScopes = httpDistUrls.map(
            ({ url, success }: { url: string; success: boolean }) =>
              nock(url)
                .head(url.endsWith("/") ? "/" : "")
                .reply(success ? 200 : 404)
          );

          allDists.forEach((dist: Record) => {
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

            // console.log(
            //   "unknowns: " +
            //     downloadURL +
            //     ":" +
            //     downloadUnknown +
            //     "/" +
            //     accessURL +
            //     ":" +
            //     accessUnknown
            // );

            // console.log(
            //   `expecting PUT /records/${encodeURIComponentWithApost(
            //     dist.id
            //   )}/aspects/source-link-status` +
            //     ": " +
            //     (success ? "active" : "broken")
            // );

            registryScope
              .put(
                `/records/${encodeURIComponentWithApost(
                  dist.id
                )}/aspects/source-link-status`,
                {
                  status: success
                    ? "active"
                    : downloadUnknown || accessUnknown ? "unknown" : "broken"
                  // httpStatusCode: () => true,
                  // errorDetails: () => true
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
                () => true
              )
              .reply(201);
          }

          const registry = new Registry({
            baseUrl: registryUrl,
            maxRetries: 0
          });

          return onRecordFound(registry, record, 0)
            .then(() => {
              afterEachProperty();
              distScopes.forEach(scope => scope.done());
              registryScope.done();

              return true;
            })
            .catch(err => {
              console.error(err);

              throw err;
            });
        }
      ),
      {
        rngState: "8980b5214cf3da6e79",
        tests: 500
        // quiet: false
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
